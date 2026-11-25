// The only file that knows football-data.org; swapping the source means rewriting this one.

export interface ClTeamRow { id: number; name: string; short_name: string; crest: string | null }
export interface ClFixtureRow {
  id: number
  gameweek_id: number
  kickoff_time: string | null
  team_h: number
  team_a: number
  team_h_score: number | null
  team_a_score: number | null
  started: boolean
  finished_provisional: boolean
  finished: boolean
}
export interface ClData { teams: ClTeamRow[]; fixtures: ClFixtureRow[] }

// deno-lint-ignore no-explicit-any
type Json = any

const KNOCKOUT: Record<string, number> = { PLAYOFFS: 9, LAST_16: 10, QUARTER_FINALS: 11, SEMI_FINALS: 12, FINAL: 13 }
const OFF = new Set(['POSTPONED', 'CANCELLED', 'AWARDED'])
const RUNNING = new Set(['IN_PLAY', 'PAUSED', 'EXTRA_TIME', 'PENALTY_SHOOTOUT', 'SUSPENDED', 'FINISHED'])

function roundOf(m: Json): number | null {
  if (m.stage === 'LEAGUE_STAGE') return m.matchday >= 1 && m.matchday <= 8 ? m.matchday : null
  return KNOCKOUT[m.stage] ?? null
}

/** Throws when the answer is not a match list. */
export function translate(body: unknown): ClData {
  const matches = (body as Json)?.matches
  if (!Array.isArray(matches)) throw new Error('football-data: no match list in the answer')
  const teams = new Map<number, ClTeamRow>()
  const fixtures: ClFixtureRow[] = []
  const unknownStage: number[] = [], noScore: number[] = []

  for (const m of matches as Json[]) {
    // Knockout matches are listed before both teams are known.
    if (m.homeTeam?.id == null || m.awayTeam?.id == null) continue
    const round = roundOf(m)
    if (round == null) { unknownStage.push(m.id); continue }
    for (const t of [m.homeTeam, m.awayTeam]) {
      // Not `tla`: both Barcelona and Bayern are FCB.
      teams.set(t.id, { id: t.id, name: t.name, short_name: t.shortName || t.name, crest: t.crest || null })
    }
    const off = OFF.has(m.status)
    const started = RUNNING.has(m.status)
    // Outside REGULAR fullTime includes extra time and penalties; only the 90 minutes count.
    const s = m.score?.duration === 'REGULAR' ? m.score.fullTime : m.score?.regularTime
    const known = started && s?.home != null && s?.away != null
    if (m.status === 'FINISHED' && !known) noScore.push(m.id)
    const finished = m.status === 'FINISHED' && known
    fixtures.push({
      id: m.id, gameweek_id: round, kickoff_time: off ? null : m.utcDate ?? null,
      team_h: m.homeTeam.id, team_a: m.awayTeam.id,
      team_h_score: known ? s.home : null, team_a_score: known ? s.away : null,
      started, finished_provisional: finished, finished,
    })
  }
  if (unknownStage.length) console.warn('football-data: unknown stage, matches left out', unknownStage)
  if (noScore.length) console.warn('football-data: finished without a 90-minute score', noScore)
  return { teams: [...teams.values()], fixtures }
}

export async function fetchChampionsLeague(key: string): Promise<ClData> {
  const res = await fetch('https://api.football-data.org/v4/competitions/CL/matches', {
    headers: { 'X-Auth-Token': key },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    await res.body?.cancel()
    throw new Error(`football-data → ${res.status}`)
  }
  return translate(await res.json())
}
