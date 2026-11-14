export type TipState = 'open' | 'locked' | 'scored' | 'postponed'

export function tipState(
  f: { kickoff_time: string | null; finished_provisional: boolean },
  now: Date = new Date(),
): TipState {
  if (f.finished_provisional) return 'scored'
  if (!f.kickoff_time) return 'postponed'
  return new Date(f.kickoff_time) > now ? 'open' : 'locked'
}
