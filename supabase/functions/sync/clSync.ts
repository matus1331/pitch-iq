import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { scoreMatchTip } from '../_shared/scoring.ts'
import { type ClData, fetchChampionsLeague } from './footballData.ts'

export type ClResult = { fixtures: number; scored: number } | { skipped: true } | { error: string }

interface TipRow { user_id: string; fixture_id: number; home_goals: number; away_goals: number; points: number | null; is_final: boolean }

/** Corrections of the score are picked up this long after kickoff. */
const RESCORE_MS = 7 * 86400e3

function must<T>(r: { data: T | null; error: unknown }): T {
  if (r.error) throw r.error
  return (r.data ?? []) as T
}

/** Stores the matches and scores the tips from scratch (idempotent). Matches missing from the answer stay as they are. */
export async function runClSync(db: SupabaseClient, data: ClData, now = new Date()): Promise<{ fixtures: number; scored: number }> {
  if (data.teams.length) must(await db.from('cl_teams').upsert(data.teams))
  if (data.fixtures.length) must(await db.from('cl_fixtures').upsert(data.fixtures))

  const byId = new Map(data.fixtures.map((f) => [f.id, f]))
  const done = data.fixtures.filter((f) => f.finished)
  const recent = (f: { kickoff_time: string | null }) => f.kickoff_time != null && now.getTime() - Date.parse(f.kickoff_time) <= RESCORE_MS
  const ids = (list: { id: number }[]) => list.map((f) => f.id)
  const tips = () => db.from('cl_match_tips').select('*')

  // No longer finished (postponed after all, result withdrawn): the points go away. Only the points are written,
  // such a match may be open for tips again.
  const undone = must(await db.from('cl_match_tips').update({ points: null, is_final: false })
    .in('fixture_id', ids(data.fixtures.filter((f) => !f.finished))).not('points', 'is', null).select('fixture_id'))
  if ((undone as unknown[]).length) console.warn('cl: points withdrawn', undone)

  const due = [
    ...must(await tips().in('fixture_id', ids(done.filter(recent)))) as TipRow[],
    ...must(await tips().in('fixture_id', ids(done.filter((f) => !recent(f)))).is('points', null)) as TipRow[],
  ]
  const changed = due.flatMap((t) => {
    const f = byId.get(t.fixture_id)!
    const points = scoreMatchTip({ kind: 'exact', ...t }, f.team_h_score!, f.team_a_score!)
    return t.points === points && t.is_final ? [] : [{ ...t, points, is_final: true }]
  })
  if (changed.length) must(await db.from('cl_match_tips').upsert(changed))
  return { fixtures: data.fixtures.length, scored: changed.length }
}

/** Never throws: skipped without a key, { error } on any failure, so the Premier League sync does not depend on it. */
export async function syncChampionsLeague(
  db: SupabaseClient,
  key: string | undefined,
  fetcher: (key: string) => Promise<ClData> = fetchChampionsLeague,
): Promise<ClResult> {
  if (!key) return { skipped: true }
  try {
    return await runClSync(db, await fetcher(key))
  } catch (e) {
    return { error: e instanceof Error ? e.message : JSON.stringify(e) }
  }
}
