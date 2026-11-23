import { iqTotals } from '@shared/level.ts'
import type { Duel } from './data'
export interface Row { user_id: string; nickname: string; points: number }
export interface RoundRow extends Row { gameweek_id: number; lineup_points?: number }

/** Sum per player (optionally for one round); every profile appears, even with 0. */
export function totals(rows: RoundRow[], profiles: { id: string; nickname: string }[], gw: number | null): Row[] {
  const sum = new Map<string, number>()
  for (const r of rows) if (gw == null || r.gameweek_id === gw) sum.set(r.user_id, (sum.get(r.user_id) ?? 0) + r.points)
  return profiles.map((p) => ({ user_id: p.id, nickname: p.nickname, points: sum.get(p.id) ?? 0 }))
}

/** Optional tie-break data: more exact scores first, then a smaller average miss. */
export interface TieBreak { exact?: number; avgError?: number | null }
const miss = (r: TieBreak) => r.avgError ?? Infinity
const sameStanding = (a: Row & TieBreak, b: Row & TieBreak) =>
  a.points === b.points && (a.exact ?? 0) === (b.exact ?? 0) && miss(a) === miss(b)

/**
 * Descending by points, then more exact scores, then smaller average miss, then nickname.
 * Players equal on all of those share a rank; the next rank follows without a gap (1, 2, 2, 3).
 */
export function rankRows<T extends Row & TieBreak>(rows: T[]): (T & { rank: number })[] {
  const sorted = [...rows].sort((a, b) =>
    b.points - a.points || (b.exact ?? 0) - (a.exact ?? 0) || miss(a) - miss(b) || a.nickname.localeCompare(b.nickname, 'sk'))
  let rank = 0
  return sorted.map((r, i) => {
    if (i === 0 || !sameStanding(sorted[i - 1], r)) rank++
    return { ...r, rank }
  })
}

export interface TipResult {
  user_id: string
  kind: '1x2' | 'exact'
  home_goals: number | null
  away_goals: number | null
  points: number | null
  gameweek_id: number | null
  team_h_score: number | null
  team_a_score: number | null
}
export interface TipStats { exact: number; right: number; wrong: number; avgError: number | null }

/**
 * Per player over scored match tips (optionally one round): exact scores, right winner/draw without the exact
 * score, misses, and the average miss in goals (|home - tip| + |away - tip|). Old 1/X/2 tips have no score,
 * so they count as right or wrong but not in the average.
 */
export function tipStats(tips: TipResult[], gw: number | null): Map<string, TipStats> {
  const acc = new Map<string, { exact: number; right: number; wrong: number; err: number; n: number }>()
  for (const t of tips) {
    if (t.points == null || t.team_h_score == null || t.team_a_score == null || (gw != null && t.gameweek_id !== gw)) continue
    const s = acc.get(t.user_id) ?? { exact: 0, right: 0, wrong: 0, err: 0, n: 0 }
    acc.set(t.user_id, s)
    if (t.kind === 'exact' && t.home_goals != null && t.away_goals != null) {
      s.err += Math.abs(t.home_goals - t.team_h_score) + Math.abs(t.away_goals - t.team_a_score)
      s.n++
      if (t.home_goals === t.team_h_score && t.away_goals === t.team_a_score) { s.exact++; continue }
    }
    if (t.points > 0) s.right++; else s.wrong++
  }
  // rounded so equal averages (1/3 and 2/6) compare equal
  return new Map([...acc].map(([u, s]) => [u, { exact: s.exact, right: s.right, wrong: s.wrong, avgError: s.n ? Math.round((s.err / s.n) * 1000) / 1000 : null }]))
}

/** One player's IQ across both competitions; the last round is the latest one anybody scored in. */
export function iqSummary(individual: RoundRow[], club: RoundRow[], userId: string) {
  const mine = (rows: RoundRow[], gw?: number) =>
    rows.filter((r) => r.user_id === userId && (gw == null || r.gameweek_id === gw)).reduce((s, r) => s + r.points, 0)
  const rounds = [...individual, ...club].map((r) => r.gameweek_id)
  const lastRound = rounds.length ? Math.max(...rounds) : null
  return {
    total: mine(individual) + mine(club),
    peak: iqTotals([...individual, ...club].filter((r) => r.user_id === userId), []).peak,
    lastRound,
    lastRoundIndividual: lastRound == null ? 0 : mine(individual, lastRound),
    lastRoundClub: lastRound == null ? 0 : mine(club, lastRound),
  }
}

const mineDelta = (d: Duel, userId: string) => (d.challenger_id === userId ? d.challenger_delta : d.opponent_delta) ?? 0
const myFinished = (duels: Duel[], userId: string) =>
  duels.filter((d) => d.status === 'finished' && (d.challenger_id === userId || d.opponent_id === userId))
    .sort((a, b) => a.gameweek_id - b.gameweek_id)

export function duelRecord(duels: Duel[], userId: string) {
  let won = 0, drawn = 0, lost = 0, net = 0, streak = 0, bestStreak = 0
  for (const d of myFinished(duels, userId)) {
    const delta = mineDelta(d, userId)
    net += delta
    if (delta > 0) { won++; bestStreak = Math.max(bestStreak, ++streak) } else { streak = 0; if (delta < 0) lost++; else drawn++ }
  }
  return { won, drawn, lost, net, bestStreak }
}
