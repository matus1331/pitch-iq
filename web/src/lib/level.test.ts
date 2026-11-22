import { describe, expect, it } from 'vitest'
import { iqTotals, levelFor, MAX_LEVEL, TITLES } from '@shared/level.ts'

describe('levelFor', () => {
  it('starts at level 1 as a Rookie', () => {
    expect(levelFor(0)).toMatchObject({ level: 1, title: 'Rookie', progress: 0, needed: 18 })
  })
  it('shows progress inside a level', () => {
    expect(levelFor(17)).toMatchObject({ level: 1, progress: 17, needed: 18 })
  })
  it('levels up exactly at the threshold', () => {
    expect(levelFor(18)).toMatchObject({ level: 2 })
    expect(levelFor(74)).toMatchObject({ level: 4 })
  })
  it('changes title every five levels', () => {
    expect(levelFor(74)).toMatchObject({ level: 4, title: 'Rookie' })
    expect(levelFor(75)).toMatchObject({ level: 5, title: 'Scout' })
    expect(levelFor(194)).toMatchObject({ level: 10, title: 'Analyst' })
    expect(levelFor(511)).toMatchObject({ level: 20, title: 'Strategist' })
    expect(levelFor(709)).toMatchObject({ level: 25, title: 'Pundit' })
    expect(levelFor(2023)).toMatchObject({ level: 49, title: 'Hall of Famer' })
  })
  it('caps at level 50 as a PitchIQ Legend', () => {
    expect(MAX_LEVEL).toBe(50)
    expect(levelFor(2090)).toMatchObject({ level: 49 })
    expect(levelFor(2091)).toMatchObject({ level: 50, title: 'PitchIQ Legend', needed: null })
    expect(levelFor(9000)).toMatchObject({ level: 50, needed: null })
  })
  it('has a title for every fifth level', () => {
    expect(TITLES.map((t) => t.from)).toEqual([1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50])
  })
})

describe('iqTotals', () => {
  it('adds tips and duels round by round', () => {
    expect(iqTotals([{ gameweek_id: 1, points: 12 }, { gameweek_id: 2, points: 8 }], [{ gameweek_id: 2, points: 10 }]))
      .toEqual({ total: 30, peak: 30 })
  })
  it('keeps the peak when a lost duel lowers the total', () => {
    expect(iqTotals([{ gameweek_id: 1, points: 20 }, { gameweek_id: 2, points: 4 }], [{ gameweek_id: 2, points: -10 }]))
      .toEqual({ total: 14, peak: 24 })
  })
  it('counts the round tips before the duel result of that round', () => {
    // 10 after round 1, +6 tips in round 2 peaks at 16, then the duel takes 20.
    expect(iqTotals([{ gameweek_id: 1, points: 10 }, { gameweek_id: 2, points: 6 }], [{ gameweek_id: 2, points: -20 }]))
      .toEqual({ total: -4, peak: 16 })
  })
  it('is zero for a new player', () => {
    expect(iqTotals([], [])).toEqual({ total: 0, peak: 0 })
  })
})
