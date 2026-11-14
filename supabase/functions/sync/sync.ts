import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { iqTotals, levelFor } from '../_shared/level.ts'
import { drawOffer } from '../_shared/rotation.ts'
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
  must(await db.from('teams').upsert(boot.teams.map((t: Json) => ({ id: t.id, code: t.code, name: t.name, short_name: t.short_name }))))
  must(await db.from('players').upsert(boot.elements.map((e: Json) => ({ id: e.id, team_id: e.team, web_name: e.web_name, position: e.element_type }))))
  must(await db.from('gameweeks').upsert(boot.events.map((e: Json) => ({
    id: e.id, deadline_time: e.deadline_time, is_current: e.is_current, is_next: e.is_next, finished: e.finished,
  }))))
  const current: number = (boot.events.find((e: Json) => e.is_current) ?? boot.events.find((e: Json) => !e.finished) ?? boot.events.at(-1)).id

  // 2. fixtures (all, so postponements are seen)
  const raw = await fpl.fetchFixtures()
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
        const entry = (el.explain ?? []).find((x: Json) => x.fixture === f.id)
        const stats = double ? statsFromExplain(entry ?? {}) : statsFromLive(el.stats)
        rows.push({ player_id: el.id, fixture_id: f.id, team_id: team, stats })
      }
    }
    if (rows.length) must(await db.from('player_match_stats').upsert(rows))
  }

  // 4. draw offers for upcoming matches of owned clubs: one six per round, shared by every club,
  //    and different from the previous round's six.
  const owned = new Set<number>(
    must(await db.from('profiles').select('club_team_id').not('club_team_id', 'is', null)).map((p: Json) => p.club_team_id),
  )
  const existingOffers: Json[] = must(await db.from('club_tip_offers').select('fixture_id, team_id, tip_keys'))
  const hasOffer = new Set(existingOffers.map((o) => `${o.fixture_id}:${o.team_id}`))
  const roundKeys = new Map<number, string[]>()
  for (const o of existingOffers) {
    const gw = byId.get(o.fixture_id)?.gameweek_id
    if (gw != null && !roundKeys.has(gw)) roundKeys.set(gw, o.tip_keys)
  }
  for (const gw of [current, current + 1]) {
    const roundFixtures = fixtures.filter((f) => f.gameweek_id === gw && f.kickoff_time && !f.started)
    const missing = roundFixtures.flatMap((f) => [f.team_h, f.team_a].filter((t) => owned.has(t) && !hasOffer.has(`${f.id}:${t}`)).map((t) => [f.id, t] as const))
    if (!missing.length) continue
    // Double-gameweek-safe keys for the whole round as soon as any club plays twice in it.
    const double = fixtures.some((f) => f.gameweek_id === gw && (f.is_double_gw_h || f.is_double_gw_a))
    if (!roundKeys.has(gw)) roundKeys.set(gw, drawOffer(roundKeys.get(gw - 1) ?? [], double, Math.random))
    must(await db.from('club_tip_offers').insert(missing.map(([fixture_id, team_id]) => ({ fixture_id, team_id, tip_keys: roundKeys.get(gw)! }))))
    for (const [f, t] of missing) hasOffer.add(`${f}:${t}`)
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
  const clubOf = new Map<string, number>(
    must(await db.from('profiles').select('id, club_team_id')).map((p: Json) => [p.id, p.club_team_id]),
  )

  for (const f of done) {
    const matchTips: Json[] = must(await db.from('match_tips').select('*').eq('fixture_id', f.id))
    if (matchTips.length) {
      must(await db.from('match_tips').upsert(matchTips.map((t) => ({
        ...t, points: scoreMatchTip(t, f.team_h_score!, f.team_a_score!), is_final: f.finished,
      }))))
      scored += matchTips.length
    }

    const clubTips: Json[] = must(await db.from('club_tips').select('*').eq('fixture_id', f.id))
    if (!clubTips.length) continue
    const voided = new Set<number>(
      must(await db.from('club_tip_offers').select('team_id').eq('fixture_id', f.id).eq('voided', true)).map((o: Json) => o.team_id),
    )
    const statsRows: Json[] = must(await db.from('player_match_stats').select('player_id, team_id, stats').eq('fixture_id', f.id))
    const players = new Map(statsRows.map((s) => [s.player_id, { teamId: s.team_id, stats: s.stats }]))
    must(await db.from('club_tips').upsert(clubTips.map((t) => {
      const club = clubOf.get(t.user_id)
      let pts = 0
      if (club != null && (club === f.team_h || club === f.team_a) && !voided.has(club)) {
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
  await settleDuels(db, fixtures)
  return { fixtures: fixtures.length, scored }
}

// 7. duels: unanswered challenges expire when their round starts; accepted ones settle once the round is over.
async function settleDuels(db: SupabaseClient, fixtures: FixtureRow[]) {
  const started = new Set(fixtures.filter((f) => f.started).map((f) => f.gameweek_id))
  const over = new Set(fixtures.filter((f) => f.gameweek_id != null).map((f) => f.gameweek_id))
  for (const f of fixtures) if (f.gameweek_id != null && !f.finished) over.delete(f.gameweek_id)

  const open: Json[] = must(await db.from('duels').select('*').in('status', ['pending', 'accepted']))
  const expired = open.filter((d) => d.status === 'pending' && started.has(d.gameweek_id)).map((d) => d.id)
  if (expired.length) must(await db.from('duels').update({ status: 'expired' }).in('id', expired))
  const due = open.filter((d) => d.status === 'accepted' && over.has(d.gameweek_id)).sort((a, b) => a.gameweek_id - b.gameweek_id)
  if (!due.length) return

  const users = [...new Set(due.flatMap((d) => [d.challenger_id, d.opponent_id]))]
  const tips: Json[] = [
    ...must(await db.from('leaderboard_individual').select('user_id, gameweek_id, points').in('user_id', users)),
    ...must(await db.from('leaderboard_club').select('user_id, gameweek_id, points').in('user_id', users)),
  ]
  const settled: Json[] = must(await db.from('duels').select('*').eq('status', 'finished'))
  const steps = (user: string, before: number) => iqTotals(
    tips.filter((t) => t.user_id === user && t.gameweek_id < before),
    settled.filter((d) => d.gameweek_id < before && (d.challenger_id === user || d.opponent_id === user))
      .map((d) => ({ gameweek_id: d.gameweek_id, points: d.challenger_id === user ? d.challenger_delta : d.opponent_delta })),
  )
  const roundIq = (user: string, gw: number) =>
    tips.filter((t) => t.user_id === user && t.gameweek_id === gw).reduce((n, t) => n + t.points, 0)

  for (const d of due) {
    const c = roundIq(d.challenger_id, d.gameweek_id), o = roundIq(d.opponent_id, d.gameweek_id)
    const levelBefore = (u: string) => levelFor(steps(u, d.gameweek_id).peak).level
    // The winner takes the stake; an underdog winner (lower level before the round) gets half again on top.
    const win = (winner: string, loser: string) => d.stake + (levelBefore(winner) < levelBefore(loser) ? Math.floor(d.stake / 2) : 0)
    const challenger_delta = c > o ? win(d.challenger_id, d.opponent_id) : c < o ? -d.stake : 0
    const opponent_delta = o > c ? win(d.opponent_id, d.challenger_id) : o < c ? -d.stake : 0
    const row = { status: 'finished', challenger_iq: c, opponent_iq: o, challenger_delta, opponent_delta }
    must(await db.from('duels').update(row).eq('id', d.id).eq('status', 'accepted'))
    settled.push({ ...d, ...row })
  }
}
