import { CATALOG_BY_KEY } from './catalog.ts'

export interface PlayerStats {
  minutes: number
  starts: number | null
  goals_scored: number
  assists: number
  yellow_cards: number
  red_cards: number
  own_goals: number
  saves: number
  bonus: number
  penalties_missed: number
  penalties_saved: number
  tackles: number | null
  expected_goals: number | null
  /** FPL points of the player in this match. */
  total_points: number | null
  /** FPL `explain` entry of this match: how the points were earned. */
  breakdown: { identifier: string; value: number; points: number }[]
}

export interface MatchContext {
  clubId: number
  opponentId: number
  clubGoals: number
  opponentGoals: number
  players: Map<number, { teamId: number; stats: PlayerStats }>
}

export interface MatchTip {
  kind: '1x2' | 'exact'
  outcome?: 'H' | 'D' | 'A' | null
  home_goals?: number | null
  away_goals?: number | null
}

export interface ClubTip {
  tip_key: string
  player_id?: number | null
  value?: number | null
}

/** From this round on only exact scores can be tipped; older 1/X/2 tips still count. */
export const EXACT_ONLY_FROM_GW = 12

/** Right winner or draw: 3 IQ, plus 3 IQ when the exact score is right too. */
export function scoreMatchTip(tip: MatchTip, home: number, away: number): number {
  const outcomeOf = (h: number, a: number) => (h > a ? 'H' : h < a ? 'A' : 'D')
  const outcome = outcomeOf(home, away)
  if (tip.kind === 'exact') {
    if (tip.home_goals == null || tip.away_goals == null) return 0
    if (outcomeOf(tip.home_goals, tip.away_goals) !== outcome) return 0
    return tip.home_goals === home && tip.away_goals === away ? 6 : 3
  }
  return tip.outcome === outcome ? 3 : 0
}

type StatFn = (s: PlayerStats) => number

function clubStats(ctx: MatchContext): PlayerStats[] {
  return [...ctx.players.values()].filter((p) => p.teamId === ctx.clubId).map((p) => p.stats)
}
const sum = (list: PlayerStats[], f: StatFn) => list.reduce((a, s) => a + f(s), 0)
const allStats = (ctx: MatchContext) => [...ctx.players.values()].map((p) => p.stats)

/** Is the chosen player (of the club) the max of stat f within the club? Ties count. */
function isClubTop(ctx: MatchContext, s: PlayerStats, f: StatFn, minValue = 0): boolean {
  const v = f(s)
  return v >= minValue && v === Math.max(...clubStats(ctx).map(f))
}

const PLAYER_RULES: Record<string, (s: PlayerStats, ctx: MatchContext) => boolean> = {
  player_goal: (s) => s.goals_scored >= 1,
  player_brace: (s) => s.goals_scored >= 2,
  player_assist: (s) => s.assists >= 1,
  player_ga: (s) => s.goals_scored + s.assists >= 1,
  player_yellow: (s) => s.yellow_cards >= 1,
  player_top_bonus: (s, ctx) => isClubTop(ctx, s, (x) => x.bonus, 1),
  player_full90: (s) => s.minutes >= 90,
  player_super_sub: (s) => s.starts === 0 && s.minutes > 0,
  player_top_tackles: (s, ctx) => s.minutes > 0 && isClubTop(ctx, s, (x) => x.tackles ?? 0),
  player_top_xg: (s, ctx) => s.minutes > 0 && isClubTop(ctx, s, (x) => x.expected_goals ?? 0),
}

const TEAM_RULES: Record<string, (ctx: MatchContext, value: number | null) => boolean> = {
  team_goals_exact: (ctx, v) => v === ctx.clubGoals,
  team_conceded_exact: (ctx, v) => v === ctx.opponentGoals,
  team_clean_sheet: (ctx) => ctx.opponentGoals === 0,
  team_yellows_exact: (ctx, v) => v === sum(clubStats(ctx), (s) => s.yellow_cards),
  team_red: (ctx) => sum(clubStats(ctx), (s) => s.red_cards) > 0,
  team_sub_goal: (ctx) => clubStats(ctx).some((s) => s.starts === 0 && s.goals_scored > 0),
  team_scorers_count: (ctx, v) => v === clubStats(ctx).filter((s) => s.goals_scored > 0).length,
  // round to avoid float noise from summing xG values like 1.01 + 0.5
  team_xg_over: (ctx) => Math.round(sum(clubStats(ctx), (s) => s.expected_goals ?? 0) * 100) > 150,
  team_saves_over: (ctx) => sum(clubStats(ctx), (s) => s.saves) > 3,
  match_penalty_fail: (ctx) => sum(allStats(ctx), (s) => s.penalties_missed + s.penalties_saved) > 0,
  match_own_goal: (ctx) => sum(allStats(ctx), (s) => s.own_goals) > 0,
}

export function scoreClubTip(tip: ClubTip, ctx: MatchContext): number {
  const def = CATALOG_BY_KEY[tip.tip_key]
  if (!def) return 0
  let hit = false
  if (def.kind === 'player') {
    const p = tip.player_id == null ? undefined : ctx.players.get(tip.player_id)
    hit = !!p && p.teamId === ctx.clubId && PLAYER_RULES[def.key](p.stats, ctx)
  } else {
    if (def.input === 'number' && tip.value == null) return 0
    hit = TEAM_RULES[def.key](ctx, tip.value ?? null)
  }
  return hit ? def.points : 0
}
