import { describe, expect, it } from 'vitest'
import { tipState } from './tipState'

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
