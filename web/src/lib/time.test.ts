import { describe, expect, it } from 'vitest'
import { timeLeft } from './time'

const m = 60_000, h = 60 * m, d = 24 * h

describe('timeLeft', () => {
  it('speaks in the two largest units, Slovak forms', () => {
    expect(timeLeft(2 * d + 4 * h + 5 * m)).toBe('2 dni 4 h')
    expect(timeLeft(5 * d)).toBe('5 dní')
    expect(timeLeft(1 * d + 30 * m)).toBe('1 deň')
    expect(timeLeft(3 * h + 20 * m)).toBe('3 h 20 min')
    expect(timeLeft(42 * m)).toBe('42 min')
  })
  it('never says zero while time is left', () => {
    expect(timeLeft(20_000)).toBe('menej ako minútu')
  })
})
