import { describe, expect, it } from 'vitest'
import { sortRows } from './squadSort'

const rows = [{ n: 'b', v: 2 }, { n: 'a', v: null }, { n: 'c', v: 5 }]

describe('sortRows', () => {
  it('sorts numbers by direction and keeps empty values last', () => {
    expect(sortRows(rows, (r) => r.v, -1).map((r) => r.n)).toEqual(['c', 'b', 'a'])
    expect(sortRows(rows, (r) => r.v, 1).map((r) => r.n)).toEqual(['b', 'c', 'a'])
  })
  it('sorts text and does not mutate the input', () => {
    expect(sortRows(rows, (r) => r.n, 1).map((r) => r.n)).toEqual(['a', 'b', 'c'])
    expect(rows[0].n).toBe('b')
  })
})
