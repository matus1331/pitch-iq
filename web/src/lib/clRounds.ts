import type { Fixture } from './data'

const KNOCKOUT: Record<number, string> = { 9: 'Play-off', 10: 'Osemfinále', 11: 'Štvrťfinále', 12: 'Semifinále', 13: 'Finále' }
/** From this round on extra time and penalties exist, so the page says that only 90 minutes count. */
export const FIRST_KNOCKOUT_ROUND = 9

export const clRoundName = (gw: number) => KNOCKOUT[gw] ?? `${gw}. kolo`

/** First round with a match that can still be tipped, else the last one. Postponed matches have no kickoff. */
export function clDefaultRound(fixtures: Pick<Fixture, 'gameweek_id' | 'kickoff_time' | 'started'>[], now: number): number | undefined {
  const rounds = (list: typeof fixtures) => list.map((f) => f.gameweek_id!).sort((a, b) => a - b)
  const open = rounds(fixtures.filter((f) => f.kickoff_time && Date.parse(f.kickoff_time) > now && !f.started))
  return open[0] ?? rounds(fixtures).at(-1)
}
