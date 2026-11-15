import { describe, expect, it } from 'vitest'
import { availability } from './availability'

const p = (status: string, chance_next: number | null = null, news: string | null = null, start_pct: number | null = null) =>
  ({ status, chance_next, news, start_pct })

describe('availability', () => {
  it('a fit player without news has a 100 % chance and no icon', () => {
    expect(availability(p('a'))).toEqual({ icon: null, chance: 100, note: null, role: null })
  })
  it('a fit backup keeper who never starts has a 0 % chance', () => {
    expect(availability(p('a', 100, null, 0))).toMatchObject({ chance: 0 })
  })
  it('a fit regular starter gets his start share', () => {
    expect(availability(p('a', null, null, 91))).toMatchObject({ chance: 91 })
  })
  it('a doubtful regular gets the lower of start share and FPL chance', () => {
    expect(availability(p('d', 50, 'Knock', 100))).toMatchObject({ chance: 50 })
  })
  it('a doubtful player shows the FPL chance and the news', () => {
    expect(availability(p('d', 75, 'Knock - 75% chance of playing'))).toEqual({ icon: null, chance: 75, note: 'Knock - 75% chance of playing', role: null })
  })
  it('an injured player gets the injury icon, the injury text and no chance', () => {
    expect(availability(p('i', 0, 'Hamstring injury - Expected back 30 Nov')))
      .toEqual({ icon: '🚑', chance: null, note: 'Hamstring injury - Expected back 30 Nov', role: null })
  })
  it('a suspended player gets a red card and no chance', () => {
    expect(availability(p('s', 0, 'Suspended until 29 Nov'))).toMatchObject({ icon: '🟥', chance: null })
  })
  it('a player who left or is not available gets a stop sign and a fallback note', () => {
    expect(availability(p('u'))).toEqual({ icon: '⛔', chance: null, note: 'Nie je k dispozícii', role: null })
  })
  it('sorts players into regulars, rotation and bench by how often they start', () => {
    expect(availability(p('a', null, null, 70)).role).toMatchObject({ icon: '🟢', label: 'Stály hráč' })
    expect(availability(p('a', null, null, 69)).role).toMatchObject({ icon: '🟡', label: 'Občas hrá' })
    expect(availability(p('a', null, null, 30)).role).toMatchObject({ icon: '🟡', label: 'Občas hrá' })
    expect(availability(p('a', null, null, 29)).role).toMatchObject({ icon: '⚪', label: 'Náhradník' })
  })
  it('a doubtful regular stays a regular', () => {
    expect(availability(p('d', 25, 'Knock', 91)).role).toMatchObject({ label: 'Stály hráč' })
  })
})
