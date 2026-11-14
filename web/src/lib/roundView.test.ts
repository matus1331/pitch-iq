import { describe, expect, it } from 'vitest'
import { defaultRound, splitRound } from './roundView'

const f = (id: number, gameweek_id: number | null, started = false) => ({ id, gameweek_id, started })

describe('splitRound', () => {
  it('keeps postponed matches (no round) visible next to the chosen round', () => {
    const all = [f(1, 11), f(2, 12), f(3, null)]
    expect(splitRound(all, 11)).toEqual({ round: [f(1, 11)], postponed: [f(3, null)] })
  })
})

describe('defaultRound', () => {
  it('picks the first round with a match still to tip', () => {
    expect(defaultRound([f(1, 10, true), f(2, 11)], [10, 11])).toBe(11)
  })
  it('falls back to the first round', () => {
    expect(defaultRound([f(1, 10, true)], [10, 11])).toBe(10)
  })
})
