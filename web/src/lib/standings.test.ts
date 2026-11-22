import { describe, expect, it } from 'vitest'
import type { Duel } from './data'
import { categoryIq, duelRecord, iqSummary, playerIq, rankRows, totals } from './standings'

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
    expect(s).toEqual({ total: 12, lastRound: 10, lastRoundIndividual: 5, lastRoundClub: 3 })
  })
  it('gives 0 for the last round when the player skipped it', () => {
    const s = iqSummary([r('me', 9, 4), r('other', 10, 5)], [], 'me')
    expect(s).toEqual({ total: 4, lastRound: 10, lastRoundIndividual: 0, lastRoundClub: 0 })
  })
  it('has no last round before anything is scored', () => {
    expect(iqSummary([], [], 'me')).toEqual({ total: 0, lastRound: null, lastRoundIndividual: 0, lastRoundClub: 0 })
  })
})

const duel = (gameweek_id: number, challenger_id: string, opponent_id: string, challenger_delta: number, opponent_delta: number, status: Duel['status'] = 'finished'): Duel =>
  ({ id: gameweek_id, category: 'individual', gameweek_id, challenger_id, opponent_id, stake: 10, status, challenger_iq: 0, opponent_iq: 0, challenger_delta, opponent_delta })

describe('playerIq', () => {
  it('adds finished duel results to tip IQ and keeps the peak', () => {
    const tips = [{ user_id: 'me', nickname: 'me', gameweek_id: 1, points: 20 }]
    const duels = [duel(1, 'me', 'x', -10, 10), duel(2, 'x', 'me', 0, 0, 'accepted')]
    expect(playerIq(tips, [], duels, 'me')).toEqual({ total: 10, peak: 20 })
  })
})

describe('duelRecord', () => {
  it('counts wins, draws, losses, net IQ and the best win streak in round order', () => {
    const duels = [
      duel(1, 'me', 'a', 10, -10), duel(2, 'b', 'me', -5, 7), duel(3, 'me', 'c', -20, 20),
      duel(4, 'me', 'a', 0, 0), duel(5, 'me', 'b', 5, -5), duel(6, 'me', 'c', 5, -5), duel(7, 'me', 'a', 5, -5),
      duel(8, 'me', 'b', 0, 0, 'accepted'),
    ]
    expect(duelRecord(duels, 'me')).toEqual({ won: 5, drawn: 1, lost: 1, net: 12, bestStreak: 3 })
  })
})

describe('categoryIq', () => {
  it('counts only the category: its tips, its duel results and the stakes tied up in it', () => {
    const tips = [{ user_id: 'me', nickname: 'me', gameweek_id: 1, points: 22 }, { user_id: 'x', nickname: 'x', gameweek_id: 1, points: 9 }]
    const duels: Duel[] = [
      duel(1, 'me', 'x', 5, -5),
      { ...duel(2, 'x', 'me', 0, 0), category: 'club' },
      duel(3, 'x', 'me', 0, 0, 'accepted'),
      duel(4, 'me', 'y', 0, 0, 'pending'),
      duel(5, 'z', 'me', 0, 0, 'pending'), // incoming challenge ties up nothing
      { ...duel(6, 'me', 'z', 0, 0, 'accepted'), category: 'club' },
    ]
    expect(categoryIq(tips, duels, 'me', 'individual')).toEqual({ iq: 27, locked: 20, free: 7 })
    expect(categoryIq([], duels, 'me', 'club')).toEqual({ iq: 0, locked: 10, free: -10 })
  })
})
