import { describe, expect, it } from 'vitest'
import bootstrap from '../../../supabase/functions/sync/fixtures/bootstrap.json'
import { badgeUrl, CLUB_COLORS, contrastRatio } from './clubColors'

describe('CLUB_COLORS', () => {
  it('has an entry for every club in the FPL sample', () => {
    for (const t of bootstrap.teams) expect(CLUB_COLORS[t.short_name], t.short_name).toBeDefined()
  })

  it('uses #rrggbb colors with readable text on primary (WCAG AA)', () => {
    for (const [club, c] of Object.entries(CLUB_COLORS)) {
      for (const v of [c.primary, c.secondary, c.text]) expect(v, club).toMatch(/^#[0-9a-f]{6}$/i)
      expect(contrastRatio(c.text, c.primary), club).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('contrastRatio', () => {
  it('is 21 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
  })
})

describe('badgeUrl', () => {
  it('uses the team code', () => {
    expect(badgeUrl(11)).toBe('https://resources.premierleague.com/premierleague/badges/100/t11.png')
  })
})
