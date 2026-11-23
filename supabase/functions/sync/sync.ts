import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { matchDuelDeltas, sideOf } from '../_shared/duel.ts'
import { iqTotals, levelFor } from '../_shared/level.ts'
import { carryOver, lineupPoints } from '../_shared/lineup.ts'
import { eligibleKeys } from '../_shared/rotation.ts'
import { type PlayerStats, scoreClubTip, scoreMatchTip } from '../_shared/scoring.ts'

// deno-lint-ignore no-explicit-any
type Json = any

export interface FplApi {
  fetchBootstrap(): Promise<Json>
  /** All fixtures of the season (includes postponed ones with event = null). */
  fetchFixtures(): Promise<Json[]>
  fetchLive(gw: number): Promise<Json>
}

interface FixtureRow {
  id: number
  gameweek_id: number | null
  kickoff_time: string | null
  team_h: number
  team_a: number
  team_h_score: number | null
  team_a_score: number | null
  started: boolean
  finished_provisional: boolean
  finished: boolean
  is_double_gw_h: boolean
  is_double_gw_a: boolean
}

const STAT_KEYS: (keyof PlayerStats)[] = [
  'minutes', 'starts', 'goals_scored', 'assists', 'yellow_cards', 'red_cards', 'own_goals', 'saves',
  'bonus', 'penalties_missed', 'penalties_saved', 'tackles', 'expected_goals',
]
// Only these come per fixture in `explain`; in a double gameweek the others are season-round totals.
const SEPARABLE = new Set(['minutes', 'goals_scored', 'assists', 'yellow_cards', 'red_cards', 'own_goals', 'saves', 'bonus', 'penalties_missed', 'penalties_saved'])

function must<T>(r: { data: T | null; error: unknown }): T {
  if (r.error) throw r.error
  return (r.data ?? []) as T
}

function statsFromLive(stats: Json): PlayerStats {
  return Object.fromEntries(STAT_KEYS.map((k) => [k, stats[k] == null ? null : Number(stats[k])])) as unknown as PlayerStats
}

function statsFromExplain(entry: Json): PlayerStats {
  const out = Object.fromEntries(STAT_KEYS.map((k) => [k, SEPARABLE.has(k) ? 0 : null])) as Record<string, number | null>
  for (const s of entry.stats ?? []) if (SEPARABLE.has(s.identifier)) out[s.identifier] = Number(s.value)
  return out as unknown as PlayerStats
}

export async function runSync(db: SupabaseClient, fpl: FplApi): Promise<{ fixtures: number; scored: number }> {
  // 1. reference data
  const boot = await fpl.fetchBootstrap()
  const raw = await fpl.fetchFixtures()
  // ponytail: season-long start share; a player who joined mid-season looks rarer than he is.
  const played = new Map<number, number>()
  for (const f of raw) if (f.finished_provisional) for (const t of [f.team_h, f.team_a]) played.set(t, (played.get(t) ?? 0) + 1)
  const startPct = (e: Json) => played.get(e.team) ? Math.min(100, Math.round((100 * (e.starts ?? 0)) / played.get(e.team)!)) : null
  must(await db.from('teams').upsert(boot.teams.map((t: Json) => ({ id: t.id, code: t.code, name: t.name, short_name: t.short_name }))))
  must(await db.from('players').upsert(boot.elements.map((e: Json) => ({
    id: e.id, team_id: e.team, web_name: e.web_name, position: e.element_type,
    status: e.status ?? 'a', chance_next: e.chance_of_playing_next_round ?? null, news: e.news || null, start_pct: startPct(e),
    total_points: e.total_points ?? null, form: e.form == null ? null : Number(e.form), minutes: e.minutes ?? null,
    goals_scored: e.goals_scored ?? null, assists: e.assists ?? null,
  }))))
  must(await db.from('gameweeks').upsert(boot.events.map((e: Json) => ({
    id: e.id, deadline_time: e.deadline_time, is_current: e.is_current, is_next: e.is_next, finished: e.finished,
  }))))
  const current: number = (boot.events.find((e: Json) => e.is_current) ?? boot.events.find((e: Json) => !e.finished) ?? boot.events.at(-1)).id

  // 2. fixtures (all, so postponements are seen)
  const perTeamGw = new Map<string, number>()
  for (const f of raw) if (f.event != null) for (const t of [f.team_h, f.team_a]) perTeamGw.set(`${f.event}:${t}`, (perTeamGw.get(`${f.event}:${t}`) ?? 0) + 1)
  const isDouble = (gw: number | null, team: number) => gw != null && (perTeamGw.get(`${gw}:${team}`) ?? 0) > 1
  const fixtures: FixtureRow[] = raw.map((f: Json) => ({
    id: f.id, gameweek_id: f.event ?? null, kickoff_time: f.kickoff_time ?? null, team_h: f.team_h, team_a: f.team_a,
    team_h_score: f.team_h_score ?? null, team_a_score: f.team_a_score ?? null, started: !!f.started,
    finished_provisional: !!f.finished_provisional, finished: !!f.finished,
    is_double_gw_h: isDouble(f.event, f.team_h), is_double_gw_a: isDouble(f.event, f.team_a),
  }))
  // A match that FPL moved to a different round counts as postponed (spec: tips are cancelled).
  const before = new Map<number, number | null>(
    must(await db.from('fixtures').select('id, gameweek_id')).map((f: Json) => [f.id, f.gameweek_id]),
  )
  const moved = fixtures
    .filter((f) => before.has(f.id) && before.get(f.id) != null && f.gameweek_id != null && before.get(f.id) !== f.gameweek_id)
    .map((f) => f.id)
  must(await db.from('fixtures').upsert(fixtures))

  // 3. player stats for started fixtures of recent rounds
  const playerTeam = new Map<number, number>(boot.elements.map((e: Json) => [e.id, e.team]))
  const byId = new Map(fixtures.map((f) => [f.id, f]))
  const recentGws = [current - 1, current].filter((gw) => fixtures.some((f) => f.gameweek_id === gw && f.started))
  for (const gw of recentGws) {
    const live = await fpl.fetchLive(gw)
    const rows = []
    for (const el of live.elements) {
      const team = playerTeam.get(el.id)
      if (team == null) continue
      const gwFixtures = fixtures.filter((f) => f.gameweek_id === gw && f.started && (f.team_h === team || f.team_a === team))
      for (const f of gwFixtures) {
        const double = f.team_h === team ? f.is_double_gw_h : f.is_double_gw_a
        const entry = (el.explain ?? []).find((x: Json) => x.fixture === f.id) ?? {}
        const breakdown = (entry.stats ?? []).map((x: Json) => ({ identifier: x.identifier, value: Number(x.value), points: Number(x.points) }))
        const stats: PlayerStats = {
          ...(double ? statsFromExplain(entry) : statsFromLive(el.stats)),
          total_points: double ? breakdown.reduce((n: number, x: Json) => n + x.points, 0)
            : el.stats.total_points == null ? null : Number(el.stats.total_points),
          breakdown,
        }
        rows.push({ player_id: el.id, fixture_id: f.id, team_id: team, stats })
      }
    }
    if (rows.length) must(await db.from('player_match_stats').upsert(rows))
  }

  // 4. offers for upcoming matches of owned clubs: every eligible tip, also widening older offers.
  const owned = new Set<number>(
    must(await db.from('profiles').select('club_team_id').not('club_team_id', 'is', null)).map((p: Json) => p.club_team_id),
  )
  for (const gw of [current, current + 1]) {
    // Double-gameweek-safe keys for the whole round as soon as any club plays twice in it.
    const double = fixtures.some((f) => f.gameweek_id === gw && (f.is_double_gw_h || f.is_double_gw_a))
    const offers = fixtures.filter((f) => f.gameweek_id === gw && f.kickoff_time && !f.started)
      .flatMap((f) => [f.team_h, f.team_a].filter((t) => owned.has(t)).map((team_id) => ({ fixture_id: f.id, team_id, tip_keys: eligibleKeys(double) })))
    if (offers.length) must(await db.from('club_tip_offers').upsert(offers))
  }

  // 4b. at kickoff an owner without a lineup gets their last one, minus players who can no longer play.
  const clubOf = new Map<string, number>(
    must(await db.from('profiles').select('id, club_team_id')).map((p: Json) => [p.id, p.club_team_id]),
  )
  const playerInfo = new Map<number, { team_id: number; position: number; status: string }>(
    boot.elements.map((e: Json) => [e.id, { team_id: e.team, position: e.element_type, status: e.status ?? 'a' }]),
  )
  const kicked = fixtures.filter((f) => f.started && f.kickoff_time != null)
    .sort((a, b) => a.kickoff_time!.localeCompare(b.kickoff_time!))
  // Live or already finished: a match first seen finished still gets its carry-over before step 6 scores it.
  // Same window as step 6, postponed matches excluded.
  for (const f of kicked.filter((f) => f.gameweek_id != null && f.gameweek_id >= current - 1 && f.gameweek_id <= current && !moved.includes(f.id))) {
    const voided = new Set<number>(
      must(await db.from('club_tip_offers').select('team_id').eq('fixture_id', f.id).eq('voided', true)).map((o: Json) => o.team_id),
    )
    const owners = [...clubOf].filter(([, club]) => (club === f.team_h || club === f.team_a) && !voided.has(club)).map(([id]) => id)
    if (!owners.length) continue
    const has = new Set(must(await db.from('club_lineups').select('user_id').eq('fixture_id', f.id)).map((l: Json) => l.user_id))
    const rows = []
    for (const user of owners.filter((u) => !has.has(u))) {
      const club = clubOf.get(user)!
      const earlier = kicked.filter((p) => p.kickoff_time! < f.kickoff_time! && (p.team_h === club || p.team_a === club)).map((p) => p.id)
      if (!earlier.length) continue
      // The latest earlier match this owner had a lineup for.
      const prev: Json[] = must(await db.from('club_lineups').select('fixture_id, slot, player_id').eq('user_id', user).in('fixture_id', earlier))
      const last = earlier.findLast((id) => prev.some((l) => l.fixture_id === id))
      if (last == null) continue
      rows.push(...carryOver(prev.filter((l) => l.fixture_id === last), playerInfo, club).map((p) => ({ user_id: user, fixture_id: f.id, slot: p.slot, player_id: p.player_id })))
    }
    if (rows.length) must(await db.from('club_lineups').insert(rows))
  }

  // 5. postponed: void club tips, unscore match tips
  const postponed = fixtures.filter((f) => f.kickoff_time == null || f.gameweek_id == null).map((f) => f.id)
  if (postponed.length) {
    must(await db.from('match_tips').update({ points: null, is_final: false }).in('fixture_id', postponed))
  }
  const voidIds = [...postponed, ...moved]
  if (voidIds.length) {
    must(await db.from('club_tip_offers').update({ voided: true }).in('fixture_id', voidIds))
    must(await db.from('club_tips').update({ points: 0, is_final: true }).in('fixture_id', voidIds))
    must(await db.from('club_lineups').update({ points: 0, is_final: true }).in('fixture_id', voidIds))
  }

  // 6. score finished matches of the recent rounds from scratch (idempotent).
  // One fixture at a time keeps every query far below PostgREST's 1000-row cap.
  // ponytail: FPL corrections older than the previous round are not picked up; widen the window if that matters.
  let scored = 0
  const done = fixtures.filter((f) => f.finished_provisional && f.kickoff_time != null
    && f.gameweek_id != null && f.gameweek_id >= current - 1 && f.gameweek_id <= current
    && f.team_h_score != null && f.team_a_score != null)
  if (!done.length) {
    await settleDuels(db, fixtures)
    return { fixtures: fixtures.length, scored }
  }
  for (const f of done) {
    const matchTips: Json[] = must(await db.from('match_tips').select('*').eq('fixture_id', f.id))
    if (matchTips.length) {
      must(await db.from('match_tips').upsert(matchTips.map((t) => ({
        ...t, points: scoreMatchTip(t, f.team_h_score!, f.team_a_score!), is_final: f.finished,
      }))))
      scored += matchTips.length
    }

    const clubTips: Json[] = must(await db.from('club_tips').select('*').eq('fixture_id', f.id))
    const lineups: Json[] = must(await db.from('club_lineups').select('*').eq('fixture_id', f.id))
    if (!clubTips.length && !lineups.length) continue
    const voided = new Set<number>(
      must(await db.from('club_tip_offers').select('team_id').eq('fixture_id', f.id).eq('voided', true)).map((o: Json) => o.team_id),
    )
    // A tip or lineup counts only for an owner whose club plays this match and was not voided (moved match).
    const counts = (user: string) => {
      const club = clubOf.get(user)
      return club != null && (club === f.team_h || club === f.team_a) && !voided.has(club)
    }
    const statsRows: Json[] = must(await db.from('player_match_stats').select('player_id, team_id, stats').eq('fixture_id', f.id))
    const players = new Map(statsRows.map((s) => [s.player_id, { teamId: s.team_id, stats: s.stats }]))
    if (clubTips.length) {
      must(await db.from('club_tips').upsert(clubTips.map((t) => {
        let pts = 0
        if (counts(t.user_id)) {
          const club = clubOf.get(t.user_id)!
          const home = club === f.team_h
          pts = scoreClubTip(t, {
            clubId: club,
            opponentId: home ? f.team_a : f.team_h,
            clubGoals: home ? f.team_h_score! : f.team_a_score!,
            opponentGoals: home ? f.team_a_score! : f.team_h_score!,
            players,
          })
        }
        return { ...t, points: pts, is_final: f.finished }
      })))
      scored += clubTips.length
    }
    if (lineups.length) {
      const stats = new Map<number, PlayerStats>(statsRows.map((s) => [s.player_id, s.stats]))
      must(await db.from('club_lineups').upsert(lineups.map((l) => ({
        ...l, points: counts(l.user_id) ? lineupPoints(l.player_id, stats) : 0, is_final: f.finished,
      }))))
      scored += lineups.length
    }
  }
  await settleDuels(db, fixtures)
  return { fixtures: fixtures.length, scored }
}

// 7. duels. Round duels: unanswered challenges expire when their round starts, accepted ones settle once
//    the round is over. Match duels: the same per match, plus an accepted duel the challenger never picked
//    a side for is withdrawn at kickoff, and a postponed match voids its duels. Results are Rešpekt, not IQ.
async function settleDuels(db: SupabaseClient, fixtures: FixtureRow[]) {
  const started = new Set(fixtures.filter((f) => f.started).map((f) => f.gameweek_id))
  const over = new Set(fixtures.filter((f) => f.gameweek_id != null).map((f) => f.gameweek_id))
  for (const f of fixtures) if (f.gameweek_id != null && !f.finished) over.delete(f.gameweek_id)
  const byId = new Map(fixtures.map((f) => [f.id, f]))
  const postponed = (f: FixtureRow | undefined) => !f || f.kickoff_time == null || f.gameweek_id == null

  const open: Json[] = must(await db.from('duels').select('*').in('status', ['pending', 'accepted']))
  const matchDuels = open.filter((d) => d.category === 'match')
  const roundDuels = open.filter((d) => d.category !== 'match')
  const setStatus = async (status: string, ids: number[]) => {
    if (ids.length) must(await db.from('duels').update({ status }).in('id', ids))
  }

  await setStatus('cancelled', matchDuels.filter((d) => postponed(byId.get(d.fixture_id))).map((d) => d.id))
  const live = matchDuels.filter((d) => !postponed(byId.get(d.fixture_id)))
  await setStatus('expired', [
    ...roundDuels.filter((d) => d.status === 'pending' && started.has(d.gameweek_id)),
    ...live.filter((d) => d.status === 'pending' && byId.get(d.fixture_id)!.started),
  ].map((d) => d.id))
  await setStatus('withdrawn', live.filter((d) => d.status === 'accepted' && d.challenger_pick == null && byId.get(d.fixture_id)!.started).map((d) => d.id))

  for (const d of live.filter((d) => d.status === 'accepted' && d.challenger_pick != null)) {
    const f = byId.get(d.fixture_id)!
    if (!f.finished || f.team_h_score == null || f.team_a_score == null) continue
    const r = matchDuelDeltas(d.stake, d.challenger_pick, d.opponent_pick, sideOf(f.team_h_score, f.team_a_score))
    must(await db.from('duels').update({ status: 'finished', challenger_delta: r.challenger, opponent_delta: r.opponent })
      .eq('id', d.id).eq('status', 'accepted'))
  }

  const due = roundDuels.filter((d) => d.status === 'accepted' && over.has(d.gameweek_id))
  if (!due.length) return
  const users = [...new Set(due.flatMap((d) => [d.challenger_id, d.opponent_id]))]
  const tag = (category: string) => (rows: Json[]) => rows.map((r) => ({ ...r, category }))
  const tips: Json[] = [
    ...tag('individual')(must(await db.from('leaderboard_individual').select('user_id, gameweek_id, points').in('user_id', users))),
    ...tag('club')(must(await db.from('leaderboard_club').select('user_id, gameweek_id, points').in('user_id', users))),
  ]
  // Levels come from tips only (IQ before the duel's round).
  const levelBefore = (user: string, before: number) =>
    levelFor(iqTotals(tips.filter((t) => t.user_id === user && t.gameweek_id < before), []).peak).level
  // A duel compares only the IQ of its own category (result tips or club tips) in its round.
  const roundIq = (user: string, gw: number, category: string) =>
    tips.filter((t) => t.user_id === user && t.gameweek_id === gw && t.category === category).reduce((n, t) => n + t.points, 0)

  for (const d of due) {
    const c = roundIq(d.challenger_id, d.gameweek_id, d.category), o = roundIq(d.opponent_id, d.gameweek_id, d.category)
    // The winner takes the stake; an underdog winner (lower level before the round) gets half again on top.
    const win = (winner: string, loser: string) =>
      d.stake + (levelBefore(winner, d.gameweek_id) < levelBefore(loser, d.gameweek_id) ? Math.floor(d.stake / 2) : 0)
    const challenger_delta = c > o ? win(d.challenger_id, d.opponent_id) : c < o ? -d.stake : 0
    const opponent_delta = o > c ? win(d.opponent_id, d.challenger_id) : o < c ? -d.stake : 0
    const row = { status: 'finished', challenger_iq: c, opponent_iq: o, challenger_delta, opponent_delta }
    must(await db.from('duels').update(row).eq('id', d.id).eq('status', 'accepted'))
  }
}
