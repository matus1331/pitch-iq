import { assertEquals } from 'jsr:@std/assert@1'
import { CATALOG } from './catalog.ts'
import { type MatchContext, type PlayerStats, scoreClubTip, scoreMatchTip } from './scoring.ts'

const CLUB = 11
const OPP = 1

function stats(p: Partial<PlayerStats> = {}): PlayerStats {
  return {
    minutes: 90, starts: 1, goals_scored: 0, assists: 0, yellow_cards: 0, red_cards: 0,
    own_goals: 0, saves: 0, bonus: 0, penalties_missed: 0, penalties_saved: 0,
    tackles: 0, expected_goals: 0, ...p,
  }
}

function ctx(
  players: Array<[number, number, Partial<PlayerStats>]>,
  clubGoals = 0,
  opponentGoals = 0,
): MatchContext {
  return {
    clubId: CLUB,
    opponentId: OPP,
    clubGoals,
    opponentGoals,
    players: new Map(players.map(([id, teamId, s]) => [id, { teamId, stats: stats(s) }])),
  }
}

Deno.test('match tip: 1x2 draw on 0:0 scores 3', () => {
  assertEquals(scoreMatchTip({ kind: '1x2', outcome: 'D' }, 0, 0), 3)
})
Deno.test('match tip: exact 0:0 scores 6', () => {
  assertEquals(scoreMatchTip({ kind: 'exact', home_goals: 0, away_goals: 0 }, 0, 0), 6)
})
Deno.test('match tip: exact with right winner but wrong score scores 3', () => {
  assertEquals(scoreMatchTip({ kind: 'exact', home_goals: 2, away_goals: 1 }, 1, 0), 3)
})
Deno.test('match tip: exact draw with wrong score scores 3', () => {
  assertEquals(scoreMatchTip({ kind: 'exact', home_goals: 2, away_goals: 2 }, 0, 0), 3)
})
Deno.test('match tip: exact with wrong winner scores 0', () => {
  assertEquals(scoreMatchTip({ kind: 'exact', home_goals: 0, away_goals: 1 }, 1, 0), 0)
})
Deno.test('match tip: 1x2 home win scores 3', () => {
  assertEquals(scoreMatchTip({ kind: '1x2', outcome: 'H' }, 1, 0), 3)
})
Deno.test('match tip: 1x2 wrong outcome scores 0', () => {
  assertEquals(scoreMatchTip({ kind: '1x2', outcome: 'A' }, 1, 0), 0)
})

Deno.test('player_goal scores 3 for one goal', () => {
  assertEquals(scoreClubTip({ tip_key: 'player_goal', player_id: 5 }, ctx([[5, CLUB, { goals_scored: 1 }]])), 3)
})
Deno.test('player_brace: 1 goal 0, 2 goals 6', () => {
  assertEquals(scoreClubTip({ tip_key: 'player_brace', player_id: 5 }, ctx([[5, CLUB, { goals_scored: 1 }]])), 0)
  assertEquals(scoreClubTip({ tip_key: 'player_brace', player_id: 5 }, ctx([[5, CLUB, { goals_scored: 2 }]])), 6)
})
Deno.test('player_top_bonus: tie counts for both', () => {
  const c = ctx([[5, CLUB, { bonus: 3 }], [6, CLUB, { bonus: 3 }], [7, CLUB, { bonus: 1 }]])
  assertEquals(scoreClubTip({ tip_key: 'player_top_bonus', player_id: 5 }, c), 4)
  assertEquals(scoreClubTip({ tip_key: 'player_top_bonus', player_id: 6 }, c), 4)
  assertEquals(scoreClubTip({ tip_key: 'player_top_bonus', player_id: 7 }, c), 0)
})
Deno.test('player_top_bonus: nobody with bonus scores 0', () => {
  assertEquals(scoreClubTip({ tip_key: 'player_top_bonus', player_id: 5 }, ctx([[5, CLUB, {}]])), 0)
})
Deno.test('player_top_bonus: opponent bonus does not matter', () => {
  const c = ctx([[5, CLUB, { bonus: 1 }], [9, OPP, { bonus: 3 }]])
  assertEquals(scoreClubTip({ tip_key: 'player_top_bonus', player_id: 5 }, c), 4)
})
Deno.test('player_super_sub: off the bench scores 3, starter 0', () => {
  assertEquals(scoreClubTip({ tip_key: 'player_super_sub', player_id: 5 }, ctx([[5, CLUB, { starts: 0, minutes: 12 }]])), 3)
  assertEquals(scoreClubTip({ tip_key: 'player_super_sub', player_id: 5 }, ctx([[5, CLUB, { starts: 1, minutes: 12 }]])), 0)
})
Deno.test('team_goals_exact matches club goals', () => {
  assertEquals(scoreClubTip({ tip_key: 'team_goals_exact', value: 2 }, ctx([], 2, 0)), 2)
  assertEquals(scoreClubTip({ tip_key: 'team_goals_exact', value: 1 }, ctx([], 2, 0)), 0)
})
Deno.test('team_clean_sheet', () => {
  assertEquals(scoreClubTip({ tip_key: 'team_clean_sheet' }, ctx([], 1, 0)), 2)
  assertEquals(scoreClubTip({ tip_key: 'team_clean_sheet' }, ctx([], 1, 1)), 0)
})
Deno.test('team_xg_over: 1.51 scores, 1.5 does not', () => {
  assertEquals(scoreClubTip({ tip_key: 'team_xg_over' }, ctx([[5, CLUB, { expected_goals: 1.01 }], [6, CLUB, { expected_goals: 0.5 }]])), 2)
  assertEquals(scoreClubTip({ tip_key: 'team_xg_over' }, ctx([[5, CLUB, { expected_goals: 1.5 }], [9, OPP, { expected_goals: 2 }]])), 0)
})
Deno.test('match_own_goal counts opponent own goal', () => {
  assertEquals(scoreClubTip({ tip_key: 'match_own_goal' }, ctx([[9, OPP, { own_goals: 1 }]])), 4)
})
Deno.test('team_yellows_exact sums only club players', () => {
  const c = ctx([[5, CLUB, { yellow_cards: 1 }], [6, CLUB, { yellow_cards: 1 }], [9, OPP, { yellow_cards: 1 }]])
  assertEquals(scoreClubTip({ tip_key: 'team_yellows_exact', value: 2 }, c), 2)
})
Deno.test('missing player scores zero', () => {
  assertEquals(scoreClubTip({ tip_key: 'player_goal', player_id: 999 }, ctx([[5, CLUB, { goals_scored: 1 }]])), 0)
})
Deno.test('player tip for opponent player scores zero', () => {
  assertEquals(scoreClubTip({ tip_key: 'player_goal', player_id: 9 }, ctx([[9, OPP, { goals_scored: 1 }]])), 0)
})
Deno.test('number tip without value scores zero', () => {
  assertEquals(scoreClubTip({ tip_key: 'team_goals_exact', value: null }, ctx([], 0, 0)), 0)
})

Deno.test('catalog: 21 unique keys, 10 player, 11 team', () => {
  assertEquals(CATALOG.length, 21)
  assertEquals(new Set(CATALOG.map((t) => t.key)).size, 21)
  assertEquals(CATALOG.filter((t) => t.kind === 'player').length, 10)
  assertEquals(CATALOG.filter((t) => t.kind === 'team').length, 11)
})
Deno.test('every catalog key is scorable without throwing', () => {
  for (const t of CATALOG) scoreClubTip({ tip_key: t.key, player_id: 5, value: 0 }, ctx([[5, CLUB, {}]]))
})
