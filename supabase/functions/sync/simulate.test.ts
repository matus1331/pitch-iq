import { assert, assertEquals } from 'jsr:@std/assert@1'
import bootstrap from './fixtures/bootstrap.json' with { type: 'json' }
import { simulateRound } from './simulate.ts'
import type { FplApi } from './sync.ts'

const ARS = 1, EVE = 9
const fixtures = [
  { id: 1, event: 11, team_h: EVE, team_a: ARS, kickoff_time: '2026-11-21T15:00:00Z', started: false, finished: false, finished_provisional: false, team_h_score: null, team_a_score: null },
  { id: 2, event: 12, team_h: ARS, team_a: EVE, kickoff_time: '2026-11-28T15:00:00Z', started: false, finished: false, finished_provisional: false, team_h_score: null, team_a_score: null },
]
const real: FplApi = {
  fetchBootstrap: () => Promise.resolve(bootstrap),
  fetchFixtures: () => Promise.resolve(structuredClone(fixtures)),
  fetchLive: () => Promise.resolve({ elements: [] }),
}

Deno.test('simulated round is finished with stable scores, other rounds untouched', async () => {
  const sim = simulateRound(real, 11)
  const [a, b] = [await sim.fetchFixtures(), await sim.fetchFixtures()]
  assertEquals(a.map((f) => f.team_h_score), b.map((f) => f.team_h_score))
  const played = a.find((f) => f.id === 1)!
  assertEquals([played.started, played.finished_provisional, played.finished], [true, true, true])
  assert(played.team_h_score >= 0 && played.team_a_score >= 0)
  assert(new Date(played.kickoff_time) < new Date(), 'kicked off in the past, so tips lock and show to everyone')
  assertEquals(a.find((f) => f.id === 2), fixtures[1])
})

Deno.test('simulated round becomes the current one', async () => {
  const boot = await simulateRound(real, 11).fetchBootstrap()
  assertEquals(boot.events.filter((e: { is_current: boolean }) => e.is_current).map((e: { id: number }) => e.id), [11])
})

Deno.test('player stats add up to the simulated score', async () => {
  const sim = simulateRound(real, 11)
  const match = (await sim.fetchFixtures()).find((f) => f.id === 1)!
  const live = await sim.fetchLive(11)
  const teamOf = new Map(bootstrap.elements.map((e) => [e.id, e.team]))
  const goals = (team: number) => live.elements.filter((e: { id: number }) => teamOf.get(e.id) === team)
    .reduce((n: number, e: { stats: { goals_scored: number } }) => n + e.stats.goals_scored, 0)
  assertEquals([goals(EVE), goals(ARS)], [match.team_h_score, match.team_a_score])
  assert(live.elements.every((e: { stats: { minutes: number } }) => e.stats.minutes > 0))
  assertEquals(live, await sim.fetchLive(11))
})

Deno.test('simulated players get FPL points that match their breakdown', async () => {
  const live = await simulateRound(real, 11).fetchLive(11)
  for (const e of live.elements) {
    const rows = e.explain[0].stats as { points: number }[]
    assertEquals(e.stats.total_points, rows.reduce((n, r) => n + r.points, 0))
  }
  assert(live.elements.some((e: { stats: { total_points: number } }) => e.stats.total_points > 2), 'someone scores beyond minutes')
})
