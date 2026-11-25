import { assertEquals, assertThrows } from 'jsr:@std/assert@1'
import { translate } from './footballData.ts'

const BARCA = { id: 81, name: 'FC Barcelona', shortName: 'Barça', tla: 'FCB', crest: 'https://crests.football-data.org/81.png' }
const BAYERN = { id: 5, name: 'FC Bayern München', shortName: 'Bayern', tla: 'FCB', crest: 'https://crests.football-data.org/5.png' }

type Pair = [number | null, number | null]
const pair = ([home, away]: Pair) => ({ home, away })
/** A match in the shape of the real answer. */
function match(over: Record<string, unknown> = {}, duration = 'REGULAR', fullTime: Pair = [null, null], regularTime?: Pair) {
  return {
    id: 1, utcDate: '2026-12-08T20:00:00Z', status: 'TIMED', matchday: 6, stage: 'LEAGUE_STAGE',
    homeTeam: BARCA, awayTeam: BAYERN,
    score: { winner: null, duration, fullTime: pair(fullTime), halfTime: pair([null, null]), ...(regularTime && { regularTime: pair(regularTime) }) },
    ...over,
  }
}
const one = (...args: Parameters<typeof match>) => translate({ matches: [match(...args)] }).fixtures[0]
const score = (f: { team_h_score: number | null; team_a_score: number | null }) => [f.team_h_score, f.team_a_score]
const flags = (f: { started: boolean; finished_provisional: boolean; finished: boolean }) => [f.started, f.finished_provisional, f.finished]

Deno.test('an upcoming league match keeps its round and kickoff', () => {
  assertEquals(one(), {
    id: 1, gameweek_id: 6, kickoff_time: '2026-12-08T20:00:00Z', team_h: 81, team_a: 5,
    team_h_score: null, team_a_score: null, started: false, finished_provisional: false, finished: false,
  })
  assertEquals(one({ status: 'SCHEDULED' }).kickoff_time, '2026-12-08T20:00:00Z')
})

Deno.test('a finished match has its score and all flags', () => {
  const f = one({ status: 'FINISHED' }, 'REGULAR', [2, 3])
  assertEquals([score(f), flags(f)], [[2, 3], [true, true, true]])
})

Deno.test('extra time and penalties never count, only 90 minutes', () => {
  assertEquals(score(one({ status: 'FINISHED' }, 'EXTRA_TIME', [5, 0], [3, 0])), [3, 0])
  assertEquals(score(one({ status: 'FINISHED' }, 'PENALTY_SHOOTOUT', [5, 4], [1, 1])), [1, 1])
})

Deno.test('a finished match without a usable score is not scored, not even as 0:0', () => {
  for (const f of [one({ status: 'FINISHED' }, 'EXTRA_TIME', [5, 0]), one({ status: 'FINISHED' }, 'REGULAR', [null, null])]) {
    assertEquals([score(f), flags(f)], [[null, null], [true, false, false]])
  }
})

Deno.test('a running match is started, not finished', () => {
  for (const status of ['IN_PLAY', 'PAUSED', 'SUSPENDED']) {
    const f = one({ status }, 'REGULAR', [1, 0])
    assertEquals([score(f), flags(f)], [[1, 0], [true, false, false]])
  }
})

Deno.test('postponed, cancelled and awarded matches have no kickoff and no score', () => {
  for (const status of ['POSTPONED', 'CANCELLED', 'AWARDED']) {
    const f = one({ status }, 'REGULAR', [3, 0])
    assertEquals([f.kickoff_time, score(f), flags(f)], [null, [null, null], [false, false, false]])
  }
})

Deno.test('knockout stages become rounds 9 to 13, both legs in one round', () => {
  const round = (stage: string, matchday: number | null) => one({ stage, matchday }).gameweek_id
  assertEquals([round('PLAYOFFS', 1), round('PLAYOFFS', 2), round('LAST_16', 2), round('QUARTER_FINALS', 1), round('SEMI_FINALS', 2), round('FINAL', null)],
    [9, 9, 10, 11, 12, 13])
})

Deno.test('unknown stages, unknown league rounds and unknown teams are left out', () => {
  const { fixtures } = translate({
    matches: [match({ id: 1, stage: 'FOO' }), match({ id: 2, homeTeam: { id: null, name: null } }), match({ id: 3, matchday: null }), match({ id: 4 })],
  })
  assertEquals(fixtures.map((f) => f.id), [4])
})

Deno.test('teams come once and by their short name, because tla is not unique', () => {
  assertEquals(translate({ matches: [match({ id: 1 }), match({ id: 2 })] }).teams, [
    { id: 81, name: 'FC Barcelona', short_name: 'Barça', crest: BARCA.crest },
    { id: 5, name: 'FC Bayern München', short_name: 'Bayern', crest: BAYERN.crest },
  ])
})

Deno.test('a team without optional fields still has a name', () => {
  const { teams } = translate({ matches: [match({ homeTeam: { id: 7, name: 'SK Slavia Praha' } })] })
  assertEquals(teams[0], { id: 7, name: 'SK Slavia Praha', short_name: 'SK Slavia Praha', crest: null })
})

Deno.test('an answer that is not a match list throws', () => {
  for (const body of [{ message: 'x', errorCode: 429 }, null, 'x']) assertThrows(() => translate(body), Error, 'football-data')
})
