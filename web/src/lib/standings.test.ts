import { describe, expect, it } from 'vitest'
import { iqSummary, rankRows, totals } from './standings'

describe('rankRows', () => {
  it('gives equal points the same rank and skips the next', () => {
    const r = rankRows([
      { user_id: 'c', nickname: 'Cyril', points: 7 },
      { user_id: 'b', nickname: 'Beta', points: 10 },
      { user_id: 'a', nickname: 'alfa', points: 10 },
    ])
    expect(r.map((x) => [x.nickname, x.rank])).toEqual([['alfa', 1], ['Beta', 1], ['Cyril', 3]])
  })
  it('handles empty input', () => {
    expect(rankRows([])).toEqual([])
  })
})

describe('totals', () => {
  it('sums points per user across rounds and includes players with no points', () => {
    const rows = totals(
      [{ user_id: 'a', nickname: 'alfa', gameweek_id: 10, points: 5 }, { user_id: 'a', nickname: 'alfa', gameweek_id: 11, points: 2 }],
      [{ id: 'a', nickname: 'alfa' }, { id: 'b', nickname: 'beta' }],
      null,
    )
    expect(rows).toEqual([{ user_id: 'a', nickname: 'alfa', points: 7 }, { user_id: 'b', nickname: 'beta', points: 0 }])
  })
  it('filters by round', () => {
    const rows = totals(
      [{ user_id: 'a', nickname: 'alfa', gameweek_id: 10, points: 5 }, { user_id: 'a', nickname: 'alfa', gameweek_id: 11, points: 2 }],
      [{ id: 'a', nickname: 'alfa' }],
      11,
    )
    expect(rows).toEqual([{ user_id: 'a', nickname: 'alfa', points: 2 }])
  })
})

describe('iqSummary', () => {
  const r = (user_id: string, gameweek_id: number, points: number) => ({ user_id, nickname: user_id, gameweek_id, points })
  it('sums both competitions and reports the latest scored round', () => {
    const s = iqSummary([r('me', 9, 4), r('me', 10, 5)], [r('me', 10, 3)], 'me')
    expect(s).toEqual({ total: 12, lastRound: 10, lastRoundIndividual: 5, lastRoundClub: 3 })
  })
  it('gives 0 for the last round when the player skipped it', () => {
    const s = iqSummary([r('me', 9, 4), r('other', 10, 5)], [], 'me')
    expect(s).toEqual({ total: 4, lastRound: 10, lastRoundIndividual: 0, lastRoundClub: 0 })
  })
  it('has no last round before anything is scored', () => {
    expect(iqSummary([], [], 'me')).toEqual({ total: 0, lastRound: null, lastRoundIndividual: 0, lastRoundClub: 0 })
  })
})
