import { describe, expect, it } from 'vitest'
import { breakdownLabel, formatBreakdown } from './breakdown'

describe('formatBreakdown', () => {
  it('joins labelled points with a real minus sign', () => {
    expect(formatBreakdown([
      { identifier: 'goals_scored', value: 1, points: 5 },
      { identifier: 'assists', value: 1, points: 3 },
      { identifier: 'yellow_cards', value: 1, points: -1 },
    ])).toBe('Gól +5 · Asistencia +3 · Žltá karta −1')
  })
  it('leaves out rows worth nothing', () => {
    expect(formatBreakdown([{ identifier: 'minutes', value: 90, points: 2 }, { identifier: 'saves', value: 1, points: 0 }]))
      .toBe('Odohrané minúty +2')
  })
  it('shows an unknown identifier as it is', () => {
    expect(formatBreakdown([{ identifier: 'foo', value: 1, points: 2 }])).toBe('foo +2')
    expect(breakdownLabel('defensive_contribution')).toBe('Obranná práca')
  })
})
