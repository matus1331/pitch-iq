import type { Fixture } from './data'

const KNOCKOUT: Record<number, string> = { 9: 'Play-off', 10: 'Osemfinále', 11: 'Štvrťfinále', 12: 'Semifinále', 13: 'Finále' }
/** From this round on extra time and penalties exist, so the page says that only 90 minutes count. */
export const FIRST_KNOCKOUT_ROUND = 9

export const clRoundName = (gw: number) => KNOCKOUT[gw] ?? `${gw}. kolo`

/**
 * Round of the next match to tip, else the last round. By kickoff, not by round number: a postponed match that gets
 * a new date months later must not pull everybody back to its old round.
 */
export function clDefaultRound(fixtures: Pick<Fixture, 'gameweek_id' | 'kickoff_time' | 'started'>[], now: number): number | undefined {
  const next = fixtures
    .filter((f) => f.kickoff_time && Date.parse(f.kickoff_time) > now && !f.started)
    .sort((a, b) => Date.parse(a.kickoff_time!) - Date.parse(b.kickoff_time!))[0]
  return next?.gameweek_id ?? fixtures.map((f) => f.gameweek_id!).sort((a, b) => a - b).at(-1)
}
