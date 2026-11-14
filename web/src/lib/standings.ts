import { iqTotals } from '@shared/level.ts'
import type { Duel, DuelCategory } from './data'
export interface Row { user_id: string; nickname: string; points: number }
export interface RoundRow extends Row { gameweek_id: number }

/** Sum per player (optionally for one round); every profile appears, even with 0. */
export function totals(rows: RoundRow[], profiles: { id: string; nickname: string }[], gw: number | null): Row[] {
  const sum = new Map<string, number>()
  for (const r of rows) if (gw == null || r.gameweek_id === gw) sum.set(r.user_id, (sum.get(r.user_id) ?? 0) + r.points)
  return profiles.map((p) => ({ user_id: p.id, nickname: p.nickname, points: sum.get(p.id) ?? 0 }))
}

/** Descending by points; ties share a rank (1, 1, 3); ties ordered by nickname. */
export function rankRows<T extends Row>(rows: T[]): (T & { rank: number })[] {
  const sorted = [...rows].sort((a, b) => b.points - a.points || a.nickname.localeCompare(b.nickname, 'sk'))
  let rank = 0
  return sorted.map((r, i) => {
    if (i === 0 || sorted[i - 1].points !== r.points) rank = i + 1
    return { ...r, rank }
  })
}

/** One player's IQ across both competitions; the last round is the latest one anybody scored in. */
export function iqSummary(individual: RoundRow[], club: RoundRow[], userId: string) {
  const mine = (rows: RoundRow[], gw?: number) =>
    rows.filter((r) => r.user_id === userId && (gw == null || r.gameweek_id === gw)).reduce((s, r) => s + r.points, 0)
  const rounds = [...individual, ...club].map((r) => r.gameweek_id)
  const lastRound = rounds.length ? Math.max(...rounds) : null
  return {
    total: mine(individual) + mine(club),
    lastRound,
    lastRoundIndividual: lastRound == null ? 0 : mine(individual, lastRound),
    lastRoundClub: lastRound == null ? 0 : mine(club, lastRound),
  }
}

const mineDelta = (d: Duel, userId: string) => (d.challenger_id === userId ? d.challenger_delta : d.opponent_delta) ?? 0
const myFinished = (duels: Duel[], userId: string) =>
  duels.filter((d) => d.status === 'finished' && (d.challenger_id === userId || d.opponent_id === userId))
    .sort((a, b) => a.gameweek_id - b.gameweek_id)

/** Current IQ (tips + duel results) and the peak the level is taken from. */
export function playerIq(individual: RoundRow[], club: RoundRow[], duels: Duel[], userId: string) {
  return iqTotals(
    [...individual, ...club].filter((r) => r.user_id === userId),
    myFinished(duels, userId).map((d) => ({ gameweek_id: d.gameweek_id, points: mineDelta(d, userId) })),
  )
}

export function duelRecord(duels: Duel[], userId: string) {
  let won = 0, drawn = 0, lost = 0, net = 0, streak = 0, bestStreak = 0
  for (const d of myFinished(duels, userId)) {
    const delta = mineDelta(d, userId)
    net += delta
    if (delta > 0) { won++; bestStreak = Math.max(bestStreak, ++streak) } else { streak = 0; if (delta < 0) lost++; else drawn++ }
  }
  return { won, drawn, lost, net, bestStreak }
}

export const DUEL_CATEGORIES: { id: DuelCategory; label: string }[] = [
  { id: 'individual', label: 'Zápasy' },
  { id: 'club', label: 'Klub' },
]

/** IQ a player can bet in one category: its tips plus finished duels in it, minus what open duels tie up. */
export function categoryIq(tips: RoundRow[], duels: Duel[], userId: string, category: DuelCategory) {
  const iq = tips.filter((r) => r.user_id === userId).reduce((n, r) => n + r.points, 0)
    + myFinished(duels, userId).filter((d) => d.category === category).reduce((n, d) => n + mineDelta(d, userId), 0)
  // Same rule as the server: accepted duels and own outgoing challenges tie up IQ, incoming ones do not.
  const locked = duels.filter((d) => d.category === category
    && ((d.status === 'accepted' && (d.challenger_id === userId || d.opponent_id === userId))
      || (d.status === 'pending' && d.challenger_id === userId)))
    .reduce((n, d) => n + d.stake, 0)
  return { iq, locked, free: iq - locked }
}
