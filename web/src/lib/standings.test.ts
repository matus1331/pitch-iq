import { describe, expect, it } from 'vitest'
import type { Duel } from './data'
import { duelRecord, iqSummary, rankRows, tipStats, totals } from './standings'

describe('rankRows', () => {
  it('gives equal points the same rank and does not skip the next', () => {
    const r = rankRows([
      { user_id: 'c', nickname: 'Cyril', points: 7 },
      { user_id: 'b', nickname: 'Beta', points: 10 },
      { user_id: 'a', nickname: 'alfa', points: 10 },
      { user_id: 'd', nickname: 'Dan', points: 7 },
    ])
    expect(r.map((x) => [x.nickname, x.rank])).toEqual([['alfa', 1], ['Beta', 1], ['Cyril', 2], ['Dan', 2]])
  })
  it('handles empty input', () => {
    expect(rankRows([])).toEqual([])
  })
})

describe('totals', () => {
  it('sums points per user across rounds and includes players with no points', () => {
    const rows = totals(
      [{ user_id: 'a', nickname: 'alfa', gameweek_id: 10, points: 5 }, { user_id: 'a', nickname: 'alfa', gameweek_id: 11, points: 2 }],
      [{ id: 'a', nickname: 'alfa' }, { id: 'b', nickname: 'beta' }],
      null,
    )
    expect(rows).toEqual([{ user_id: 'a', nickname: 'alfa', points: 7 }, { user_id: 'b', nickname: 'beta', points: 0 }])
  })
  it('filters by round', () => {
    const rows = totals(
      [{ user_id: 'a', nickname: 'alfa', gameweek_id: 10, points: 5 }, { user_id: 'a', nickname: 'alfa', gameweek_id: 11, points: 2 }],
      [{ id: 'a', nickname: 'alfa' }],
      11,
    )
    expect(rows).toEqual([{ user_id: 'a', nickname: 'alfa', points: 2 }])
  })
})

describe('iqSummary', () => {
  const r = (user_id: string, gameweek_id: number, points: number) => ({ user_id, nickname: user_id, gameweek_id, points })
  it('sums both competitions and reports the latest scored round', () => {
    const s = iqSummary([r('me', 9, 4), r('me', 10, 5)], [r('me', 10, 3)], 'me')
    expect(s).toEqual({ total: 12, peak: 12, lastRound: 10, lastRoundIndividual: 5, lastRoundClub: 3 })
  })
  it('gives 0 for the last round when the player skipped it', () => {
    const s = iqSummary([r('me', 9, 4), r('other', 10, 5)], [], 'me')
    expect(s).toEqual({ total: 4, peak: 4, lastRound: 10, lastRoundIndividual: 0, lastRoundClub: 0 })
  })
  it('keeps the peak when lineup points drop the total', () => {
    const s = iqSummary([r('me', 1, 20)], [r('me', 2, -6)], 'me')
    expect(s).toMatchObject({ total: 14, peak: 20 })
  })
  it('has no last round before anything is scored', () => {
    expect(iqSummary([], [], 'me')).toEqual({ total: 0, peak: 0, lastRound: null, lastRoundIndividual: 0, lastRoundClub: 0 })
  })
})

const duel = (gameweek_id: number, challenger_id: string, opponent_id: string, challenger_delta: number, opponent_delta: number, status: Duel['status'] = 'finished'): Duel =>
  ({ id: gameweek_id, category: 'individual', gameweek_id, fixture_id: null, opponent_pick: null, challenger_pick: null, challenger_id, opponent_id, stake: 10, status, challenger_iq: 0, opponent_iq: 0, challenger_delta, opponent_delta })

describe('duelRecord', () => {
  it('counts wins, draws, losses, net Rešpekt and the best win streak in round order', () => {
    const duels = [
      duel(1, 'me', 'a', 10, -10), duel(2, 'b', 'me', -5, 7), duel(3, 'me', 'c', -20, 20),
      duel(4, 'me', 'a', 0, 0), duel(5, 'me', 'b', 5, -5), duel(6, 'me', 'c', 5, -5), duel(7, 'me', 'a', 5, -5),
      duel(8, 'me', 'b', 0, 0, 'accepted'),
    ]
    expect(duelRecord(duels, 'me')).toEqual({ won: 5, drawn: 1, lost: 1, net: 12, bestStreak: 3 })
  })
})

describe('rankRows tie-break and tipStats', () => {
  const r = (nickname: string, points: number, exact?: number, avgError?: number | null) => ({ user_id: nickname, nickname, points, exact, avgError })
  it('breaks equal points by exact scores, then by smaller miss', () => {
    const out = rankRows([r('a', 6, 0, 1), r('b', 6, 1, 3), r('c', 6, 0, 2)])
    expect(out.map((x) => [x.nickname, x.rank])).toEqual([['b', 1], ['a', 2], ['c', 3]])
  })
  it('keeps a shared rank when everything is equal', () => {
    expect(rankRows([r('a', 3, 0, 1), r('b', 3, 0, 1), r('c', 0)]).map((x) => x.rank)).toEqual([1, 1, 2])
  })
  it('scores the 3:2 vs 4:0 example on a 2:1 result', () => {
    const t = (user_id: string, h: number, a: number) => ({
      user_id, kind: 'exact' as const, home_goals: h, away_goals: a, points: 3, gameweek_id: 1, team_h_score: 2, team_a_score: 1,
    })
    const s = tipStats([t('x', 3, 2), t('y', 4, 0)], null)
    expect([s.get('x')!.avgError, s.get('y')!.avgError, s.get('x')!.right]).toEqual([2, 3, 1])
  })
  it('counts exact, right and wrong tips, old 1/X/2 tips without an average', () => {
    const base = { gameweek_id: 1, team_h_score: 0, team_a_score: 0 }
    const s = tipStats([
      { user_id: 'x', kind: 'exact', home_goals: 0, away_goals: 0, points: 6, ...base },
      { user_id: 'x', kind: 'exact', home_goals: 2, away_goals: 2, points: 3, ...base },
      { user_id: 'x', kind: '1x2', home_goals: null, away_goals: null, points: 0, ...base },
    ], 1).get('x')!
    expect(s).toEqual({ exact: 1, right: 1, wrong: 1, avgError: 2 })
  })
})
