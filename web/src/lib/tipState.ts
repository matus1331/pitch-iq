export type TipState = 'open' | 'locked' | 'scored' | 'postponed'

export function tipState(
  f: { kickoff_time: string | null; finished_provisional: boolean; started?: boolean },
  now: Date = new Date(),
): TipState {
  if (f.finished_provisional) return 'scored'
  if (!f.kickoff_time) return 'postponed'
  // A match can run before its stored kickoff (late schedule); the database refuses its tips too.
  if (f.started) return 'locked'
  return new Date(f.kickoff_time) > now ? 'open' : 'locked'
}

/** The middle of the card; a score the source has not told us is never shown as 0 : 0. */
export function scoreText(f: { started: boolean; finished_provisional: boolean; team_h_score: number | null; team_a_score: number | null }): string {
  return f.started || f.finished_provisional ? `${f.team_h_score ?? '–'} : ${f.team_a_score ?? '–'}` : 'vs'
}
