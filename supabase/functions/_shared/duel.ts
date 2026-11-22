/** A match result as a side: home win, draw, away win. */
export type Side = 'H' | 'D' | 'A'

export const sideOf = (home: number, away: number): Side => (home > away ? 'H' : home < away ? 'A' : 'D')

/**
 * Rešpekt both players get from a match duel. The opponent (B) holds one side; the challenger (A) picked
 * a single side or a double chance without B's. A double chance wins more often, so it wins only half the
 * stake (rounded down) and the one facing it loses only that half. Nobody hit the result: nothing moves.
 */
export function matchDuelDeltas(stake: number, challengerPick: string, opponentPick: Side, result: Side) {
  const half = Math.floor(stake / 2)
  if (opponentPick === result) return { challenger: -stake, opponent: stake }
  if (!challengerPick.includes(result)) return { challenger: 0, opponent: 0 }
  const win = challengerPick.length === 2 ? half : stake
  return { challenger: win, opponent: -win }
}
