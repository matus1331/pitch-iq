import type { MatchTip } from '@/components/MatchTipCard'
import type { Fixture } from './data'
import type { RoundRow, TipResult } from './standings'

const KNOCKOUT: Record<number, string> = { 9: 'Play-off', 10: 'Osemfinále', 11: 'Štvrťfinále', 12: 'Semifinále', 13: 'Finále' }
/** From this round on extra time and penalties exist, so the page says that only 90 minutes count. */
export const FIRST_KNOCKOUT_ROUND = 9

export const clRoundName = (gw: number) => KNOCKOUT[gw] ?? `${gw}. kolo`

type When = Pick<Fixture, 'gameweek_id' | 'kickoff_time' | 'started'>

/**
 * The rounds to show, as FPL does for the Premier League: the one being played (or played last) and the next one.
 * Rounds only move forward, so a postponed match of an old round (clSplit keeps it in reach) changes nothing here.
 */
export function clRounds(fixtures: When[], now: number): { options: number[]; initial: number | undefined } {
  const open = (f: When) => !!f.kickoff_time && Date.parse(f.kickoff_time) > now && !f.started
  const gw = (f: When) => f.gameweek_id!
  const begun = fixtures.filter((f) => f.started || (f.kickoff_time && Date.parse(f.kickoff_time) <= now)).map(gw)
  const current = begun.length ? Math.max(...begun) : undefined
  const upcoming = fixtures.filter(open).map(gw).filter((g) => current == null || g > current)
  const options = [current, upcoming.length ? Math.min(...upcoming) : undefined].filter((g): g is number => g != null)
  return { options, initial: options.find((o) => fixtures.some((f) => gw(f) === o && open(f))) ?? options[0] }
}

/** Matches of the chosen round, plus postponed ones: without a date, or still to be played from an older round. */
export function clSplit<T extends When & Pick<Fixture, 'finished'>>(all: T[], gw: number | undefined, options: number[]) {
  return {
    round: all.filter((f) => f.gameweek_id === gw && f.kickoff_time),
    postponed: all.filter((f) => !f.finished && (!f.kickoff_time || f.gameweek_id! < (options[0] ?? 0))),
  }
}

/** Scored tips in the shape the standings need. */
export function clResults(
  tips: MatchTip[],
  fixtures: Pick<Fixture, 'id' | 'gameweek_id' | 'team_h_score' | 'team_a_score'>[],
): (RoundRow & TipResult & { gameweek_id: number; points: number })[] {
  const byId = new Map(fixtures.map((f) => [f.id, f]))
  return tips.flatMap((t) => {
    const f = byId.get(t.fixture_id)
    return t.points == null || !f ? [] : [{
      user_id: t.user_id, nickname: '', kind: t.kind, home_goals: t.home_goals, away_goals: t.away_goals,
      points: t.points, gameweek_id: f.gameweek_id!, team_h_score: f.team_h_score, team_a_score: f.team_a_score,
    }]
  })
}
