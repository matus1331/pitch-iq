import { describe, expect, it } from 'vitest'
import { clDefaultRound, clRoundName } from './clRounds'

describe('clRoundName', () => {
  it('numbers the league phase and names the knockout rounds', () => {
    expect([6, 9, 10, 11, 12, 13].map(clRoundName)).toEqual(['6. kolo', 'Play-off', 'Osemfinále', 'Štvrťfinále', 'Semifinále', 'Finále'])
  })
})

describe('clDefaultRound', () => {
  const now = Date.parse('2026-11-25T12:00:00Z')
  const f = (gameweek_id: number, kickoff_time: string | null, started = false) => ({ gameweek_id, kickoff_time, started })
  const past = '2026-11-24T20:00:00Z', soon = '2026-11-25T20:00:00Z', later = '2026-12-08T20:00:00Z'

  it('picks the first round with a match still to tip', () => {
    expect(clDefaultRound([f(6, later), f(5, past, true), f(5, soon)], now)).toBe(5)
  })
  it('a postponed match with a new date does not pull players back to its old round', () => {
    expect(clDefaultRound([f(3, '2027-01-28T20:00:00Z'), f(6, later)], now)).toBe(6)
  })
  it('a postponed match does not hold the default on its round', () => {
    expect(clDefaultRound([f(3, null), f(6, later)], now)).toBe(6)
  })
  it('a match past its kickoff is not open, even when the source has not reported it yet', () => {
    expect(clDefaultRound([f(5, past, false), f(6, later)], now)).toBe(6)
  })
  it('a started match is not open, even before its stored kickoff', () => {
    expect(clDefaultRound([f(5, soon, true), f(6, later)], now)).toBe(6)
  })
  it('falls back to the last round, or none without matches', () => {
    expect(clDefaultRound([f(5, past, true), f(4, past, true)], now)).toBe(5)
    expect(clDefaultRound([], now)).toBeUndefined()
  })
})
