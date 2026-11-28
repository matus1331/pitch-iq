/** A match result as a side: home win, draw, away win. */
export type Side = 'H' | 'D' | 'A'

export const sideOf = (home: number, away: number): Side => (home > away ? 'H' : home < away ? 'A' : 'D')

/**
 * Rešpekt both players get from a match duel. Each picked 1, 1X, X, X2 or 2 (H, HD, D, DA, A) blind.
 * Only one hit the result: he wins the stake, or half of it (rounded down) with a double chance, and the
 * other loses the same. Both hit or both missed (the same pick included): nothing moves.
 */
export function matchDuelDeltas(stake: number, challengerPick: string, opponentPick: string, result: Side) {
  const a = challengerPick.includes(result), b = opponentPick.includes(result)
  if (a === b) return { challenger: 0, opponent: 0 }
  const win = (a ? challengerPick : opponentPick).length === 2 ? Math.floor(stake / 2) : stake
  return a ? { challenger: win, opponent: -win } : { challenger: -win, opponent: win }
}
