import { describe, expect, it } from 'vitest'
import { levelFor, MAX_LEVEL } from './level'

describe('levelFor', () => {
  it('starts at level 1 as a Rookie', () => {
    expect(levelFor(0)).toMatchObject({ level: 1, title: 'Rookie', progress: 0, needed: 10 })
  })
  it('shows progress inside a level', () => {
    expect(levelFor(9)).toMatchObject({ level: 1, progress: 9, needed: 10 })
  })
  it('levels up exactly at the threshold', () => {
    expect(levelFor(10)).toMatchObject({ level: 2, progress: 0, needed: 12 })
  })
  it('changes title every five levels', () => {
    expect(levelFor(51)).toMatchObject({ level: 4, title: 'Rookie' })
    expect(levelFor(52)).toMatchObject({ level: 5, title: 'Scout' })
    expect(levelFor(162)).toMatchObject({ level: 10, title: 'Analyst' })
    expect(levelFor(322)).toMatchObject({ level: 15, title: 'Tactician' })
    expect(levelFor(532)).toMatchObject({ level: 20, title: 'Mastermind' })
  })
  it('caps at the max level as a PitchIQ Legend', () => {
    expect(MAX_LEVEL).toBe(25)
    expect(levelFor(791)).toMatchObject({ level: 24 })
    expect(levelFor(792)).toMatchObject({ level: 25, title: 'PitchIQ Legend', needed: null })
    expect(levelFor(5000)).toMatchObject({ level: 25, needed: null })
  })
})
