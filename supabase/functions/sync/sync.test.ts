// Runs against the local stack: `npx supabase start`, then
// SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... deno test --allow-net --allow-env --allow-read supabase/functions/sync
import { assertEquals } from 'jsr:@std/assert@1'
import { createClient } from 'npm:@supabase/supabase-js@2'
import bootstrap from './fixtures/bootstrap.json' with { type: 'json' }
import { type FplApi, runSync } from './sync.ts'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

const ARS = 1, EVE = 9
const PICKFORD = 226, JOHNSON = 209, GABRIEL = 4
const GW = 10
const past = new Date(Date.now() - 3 * 3600e3).toISOString()
const future = new Date(Date.now() + 3 * 86400e3).toISOString()

type Fx = Record<string, unknown>
function fixture(id: number, over: Fx = {}): Fx {
  return {
    id, event: GW, kickoff_time: past, team_h: EVE, team_a: ARS, team_h_score: 2, team_a_score: 1,
    started: true, finished_provisional: true, finished: true, stats: [], ...over,
  }
}
function live(scorer: number): unknown {
  const el = (id: number, s: Record<string, number | string>) => ({
    id,
    stats: {
      minutes: 90, starts: 1, goals_scored: 0, assists: 0, yellow_cards: 0, red_cards: 0, own_goals: 0,
      saves: 0, bonus: 0, penalties_missed: 0, penalties_saved: 0, tackles: 0, expected_goals: '0.00', ...s,
    },
    explain: [{ fixture: 1001, stats: [] }],
  })
  return {
    elements: [
      el(PICKFORD, { saves: 4 }),
      el(JOHNSON, { goals_scored: scorer === JOHNSON ? 2 : 0 }),
      el(21, { goals_scored: scorer === 21 ? 2 : 0 }),
      el(GABRIEL, { goals_scored: 1 }),
    ],
  }
}
const bootstrapNow = { ...bootstrap, events: bootstrap.events.map((e) => ({ ...e, is_current: e.id === GW, is_next: e.id === GW + 1 })) }
function api(fixtures: Fx[], scorer = JOHNSON): FplApi {
  return {
    fetchBootstrap: () => Promise.resolve(bootstrapNow),
    fetchFixtures: () => Promise.resolve(fixtures),
    fetchLive: () => Promise.resolve(live(scorer)),
  }
}

async function reset(): Promise<{ alfa: string }> {
  await db.from('club_tips').delete().gte('fixture_id', 0)
  await db.from('match_tips').delete().gte('fixture_id', 0)
  await db.from('club_tip_offers').delete().gte('fixture_id', 0)
  await db.from('player_match_stats').delete().gte('fixture_id', 0)
  await db.from('fixtures').delete().gte('id', 0)
  const { data: users } = await db.auth.admin.listUsers()
  for (const u of users.users) await db.auth.admin.deleteUser(u.id)
  const { data } = await db.auth.admin.createUser({ email: 'alfa@test.local', password: 'heslo12345', email_confirm: true })
  await db.from('teams').upsert(bootstrap.teams.map(({ id, code, name, short_name }) => ({ id, code, name, short_name })))
  await ok(db.from('profiles').insert({ id: data.user!.id, nickname: 'alfa', club_team_id: EVE }))
  return { alfa: data.user!.id }
}

async function ok(p: PromiseLike<{ error: unknown }>) {
  const { error } = await p
  if (error) throw error
}

// Called after a first sync of the upcoming match, so the offer already exists.
async function seedUserWithTips(alfa: string, fixtureId: number) {
  await ok(db.from('match_tips').insert({ user_id: alfa, fixture_id: fixtureId, kind: 'exact', home_goals: 2, away_goals: 1 }))
  await ok(db.from('club_tip_offers').update({
    tip_keys: ['player_goal', 'player_brace', 'player_yellow', 'team_saves_over', 'team_red', 'match_own_goal'],
  }).eq('fixture_id', fixtureId).eq('team_id', EVE))
  await ok(db.from('club_tips').insert([
    { user_id: alfa, fixture_id: fixtureId, tip_key: 'player_brace', player_id: JOHNSON },
    { user_id: alfa, fixture_id: fixtureId, tip_key: 'team_saves_over' },
  ]))
}

async function points(table: string, fixtureId: number) {
  const { data, error } = await db.from(table).select('*').eq('fixture_id', fixtureId)
  if (error) throw error
  return data
}

Deno.test('sync imports fixtures and scores tips', async () => {
  const { alfa } = await reset()
  await runSync(db, api([fixture(1001, { kickoff_time: future, started: false, finished_provisional: false, finished: false })]))
  await seedUserWithTips(alfa, 1001)
  await runSync(db, api([fixture(1001)]))
  assertEquals((await points('match_tips', 1001))[0].points, 5)
  const club = Object.fromEntries((await points('club_tips', 1001)).map((r) => [r.tip_key, r.points]))
  assertEquals(club, { player_brace: 6, team_saves_over: 1 })
})

Deno.test('sync is idempotent', async () => {
  const { alfa } = await reset()
  await runSync(db, api([fixture(1001, { kickoff_time: future, started: false, finished_provisional: false, finished: false })]))
  await seedUserWithTips(alfa, 1001)
  await runSync(db, api([fixture(1001)]))
  await runSync(db, api([fixture(1001)]))
  assertEquals((await points('match_tips', 1001)).length, 1)
  assertEquals((await points('match_tips', 1001))[0].points, 5)
  assertEquals((await points('club_tips', 1001)).length, 2)
})

Deno.test('fpl correction rescores', async () => {
  const { alfa } = await reset()
  await runSync(db, api([fixture(1001, { kickoff_time: future, started: false, finished_provisional: false, finished: false })]))
  await seedUserWithTips(alfa, 1001)
  await runSync(db, api([fixture(1001)], JOHNSON))
  assertEquals((await points('club_tips', 1001)).find((r) => r.tip_key === 'player_brace')!.points, 6)
  await runSync(db, api([fixture(1001)], 21))
  const brace = (await points('club_tips', 1001)).find((r) => r.tip_key === 'player_brace')!
  assertEquals(brace.points, 0)
})

Deno.test('postponed match voids club tips and unscores match tips', async () => {
  const { alfa } = await reset()
  await runSync(db, api([fixture(1001, { kickoff_time: future, started: false, finished_provisional: false, finished: false })]))
  await seedUserWithTips(alfa, 1001)
  await runSync(db, api([fixture(1001, { event: null, kickoff_time: null, started: false, finished_provisional: false, finished: false, team_h_score: null, team_a_score: null })]))
  const { data: offer } = await db.from('club_tip_offers').select('voided').eq('fixture_id', 1001).single()
  assertEquals(offer!.voided, true)
  assertEquals((await points('club_tips', 1001)).map((r) => r.points), [0, 0])
  assertEquals((await points('match_tips', 1001))[0].points, null)
})

Deno.test('offer is drawn once for upcoming match of an owned club', async () => {
  await reset()
  const upcoming = [fixture(1001, { kickoff_time: future, started: false, finished_provisional: false, finished: false, team_h_score: null, team_a_score: null })]
  await runSync(db, api(upcoming))
  const first = (await db.from('club_tip_offers').select('team_id, tip_keys').eq('fixture_id', 1001)).data!
  await runSync(db, api(upcoming))
  const second = (await db.from('club_tip_offers').select('team_id, tip_keys').eq('fixture_id', 1001)).data!
  assertEquals(first.length, 1) // only EVE is owned
  assertEquals(first[0].team_id, EVE)
  assertEquals(second, first)
})

Deno.test('provisional vs final', async () => {
  const { alfa } = await reset()
  await runSync(db, api([fixture(1001, { kickoff_time: future, started: false, finished_provisional: false, finished: false })]))
  await seedUserWithTips(alfa, 1001)
  await runSync(db, api([fixture(1001, { finished: false })]))
  assertEquals((await points('match_tips', 1001))[0].is_final, false)
  await runSync(db, api([fixture(1001)]))
  assertEquals((await points('match_tips', 1001))[0].is_final, true)
})

Deno.test('match moved straight to another round voids club tips', async () => {
  const { alfa } = await reset()
  const later = new Date(Date.now() + 40 * 86400e3).toISOString()
  await runSync(db, api([fixture(1001, { kickoff_time: future, started: false, finished_provisional: false, finished: false })]))
  await seedUserWithTips(alfa, 1001)
  await runSync(db, api([fixture(1001, { event: 25, kickoff_time: later, started: false, finished_provisional: false, finished: false, team_h_score: null, team_a_score: null })]))
  const { data: offer } = await db.from('club_tip_offers').select('voided').eq('fixture_id', 1001).single()
  assertEquals(offer!.voided, true)
  assertEquals((await points('club_tips', 1001)).map((r) => r.points), [0, 0])
})

Deno.test('scores correctly when other matches hold more than 1000 stat rows', async () => {
  const { alfa } = await reset()
  const upcoming = (id: number, event: number) =>
    fixture(id, { event, kickoff_time: future, started: false, finished_provisional: false, finished: false })
  await runSync(db, api([upcoming(1002, GW - 1), upcoming(1001, GW)]))
  const filler = Array.from({ length: 1100 }, (_, i) => ({ player_id: 50000 + i, fixture_id: 1002, team_id: ARS, stats: {} }))
  await ok(db.from('player_match_stats').insert(filler))
  await seedUserWithTips(alfa, 1001)
  await runSync(db, api([fixture(1002, { event: GW - 1 }), fixture(1001)]))
  const brace = (await points('club_tips', 1001)).find((r) => r.tip_key === 'player_brace')!
  assertEquals(brace.points, 6)
})
