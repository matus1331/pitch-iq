import { describe, expect, it } from 'vitest'
import { scoreText, tipState } from './tipState'

const now = new Date('2026-11-14T12:00:00Z')

describe('tipState', () => {
  it('null kickoff is postponed', () => {
    expect(tipState({ kickoff_time: null, finished_provisional: false }, now)).toBe('postponed')
  })
  it('future kickoff is open', () => {
    expect(tipState({ kickoff_time: '2026-11-14T15:00:00Z', finished_provisional: false }, now)).toBe('open')
  })
  it('past kickoff is locked', () => {
    expect(tipState({ kickoff_time: '2026-11-14T11:59:00Z', finished_provisional: false }, now)).toBe('locked')
  })
  it('kickoff exactly now is locked', () => {
    expect(tipState({ kickoff_time: '2026-11-14T12:00:00Z', finished_provisional: false }, now)).toBe('locked')
  })
  it('finished match is scored', () => {
    expect(tipState({ kickoff_time: '2026-11-14T09:00:00Z', finished_provisional: true }, now)).toBe('scored')
  })
})

describe('a match that runs before its stored kickoff', () => {
  it('is locked', () => {
    expect(tipState({ kickoff_time: '2026-12-08T20:00:00Z', finished_provisional: false, started: true }, new Date('2026-12-08T19:00:00Z'))).toBe('locked')
  })
})

describe('scoreText', () => {
  const f = (started: boolean, team_h_score: number | null, team_a_score: number | null) => ({ started, finished_provisional: false, team_h_score, team_a_score })
  it('shows vs before kickoff and the score after it', () => {
    expect([scoreText(f(false, null, null)), scoreText(f(true, 0, 0)), scoreText(f(true, 2, 1))]).toEqual(['vs', '0 : 0', '2 : 1'])
  })
  it('never shows an unknown score as 0 : 0', () => {
    expect(scoreText(f(true, null, null))).toBe('– : –')
  })
})
