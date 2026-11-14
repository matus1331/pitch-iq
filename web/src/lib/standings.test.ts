import { describe, expect, it } from 'vitest'
import { rankRows, totals } from './standings'

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
