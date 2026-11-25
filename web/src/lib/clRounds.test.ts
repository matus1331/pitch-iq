import { describe, expect, it } from 'vitest'
import { clResults, clRoundName, clRounds, clSplit } from './clRounds'

const now = Date.parse('2026-11-25T12:00:00Z')
const past = '2026-11-24T20:00:00Z', soon = '2026-11-25T20:00:00Z', later = '2026-12-08T20:00:00Z'
let id = 0
const f = (gameweek_id: number, kickoff_time: string | null, over: { started?: boolean; finished?: boolean } = {}) =>
  ({ id: ++id, gameweek_id, kickoff_time, started: false, finished: false, ...over })
const played = (gw: number) => f(gw, past, { started: true, finished: true })

describe('clRoundName', () => {
  it('numbers the league phase and names the knockout rounds', () => {
    expect([6, 9, 10, 11, 12, 13].map(clRoundName)).toEqual(['6. kolo', 'Play-off', 'Osemfinále', 'Štvrťfinále', 'Semifinále', 'Finále'])
  })
})

describe('clRounds', () => {
  it('offers the round being played and the next one, and opens the first with a match to tip', () => {
    expect(clRounds([played(4), played(5), f(5, soon), f(6, later), f(7, later)], now)).toEqual({ options: [5, 6], initial: 5 })
  })
  it('opens the next round once the current one has nothing left to tip', () => {
    expect(clRounds([played(5), f(6, later)], now)).toEqual({ options: [5, 6], initial: 6 })
  })
  it('a match past its kickoff counts as played, even when the source has not reported it yet', () => {
    expect(clRounds([f(5, past), f(6, later)], now)).toEqual({ options: [5, 6], initial: 6 })
  })
  it('a started match is not open, even before its stored kickoff', () => {
    expect(clRounds([f(5, soon, { started: true }), f(6, later)], now)).toEqual({ options: [5, 6], initial: 6 })
  })
  it('a postponed match keeps nobody in its old round, with or without a new date', () => {
    expect(clRounds([f(3, null), f(3, later), played(5), f(6, later)], now)).toEqual({ options: [5, 6], initial: 6 })
  })
  it('before the season only the first round, after it only the last, without matches none', () => {
    expect(clRounds([f(1, later), f(2, later)], now)).toEqual({ options: [1], initial: 1 })
    expect(clRounds([played(12), played(13)], now)).toEqual({ options: [13], initial: 13 })
    expect(clRounds([], now)).toEqual({ options: [], initial: undefined })
  })
})

describe('clSplit', () => {
  it('postponed matches of any round stay within reach, the rest of the old rounds does not', () => {
    const [noDate, newDate, old, mine, live, next] = [f(3, null), f(3, later), played(4), f(6, later), f(5, past, { started: true }), f(6, null)]
    expect(clSplit([noDate, newDate, old, mine, live, next], 6, [5, 6])).toEqual({ round: [mine], postponed: [noDate, newDate, next] })
  })
})

describe('clResults', () => {
  it('joins scored tips to their match and leaves out the unscored ones', () => {
    const match = { id: 1, gameweek_id: 5, team_h_score: 2, team_a_score: 1 }
    const tip = { user_id: 'a', fixture_id: 1, kind: 'exact' as const, outcome: null, home_goals: 2, away_goals: 1, points: 6, is_final: true }
    expect(clResults([tip, { ...tip, user_id: 'b', points: null }, { ...tip, fixture_id: 9 }], [match])).toEqual([
      { user_id: 'a', nickname: '', kind: 'exact', home_goals: 2, away_goals: 1, points: 6, gameweek_id: 5, team_h_score: 2, team_a_score: 1 },
    ])
  })
})
