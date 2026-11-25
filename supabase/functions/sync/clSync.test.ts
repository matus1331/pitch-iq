// Runs against the local stack, like sync.test.ts.
import { assert, assertEquals } from 'jsr:@std/assert@1'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { runClSync, syncChampionsLeague } from './clSync.ts'
import type { ClData, ClFixtureRow } from './footballData.ts'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

const ago = (hours: number) => new Date(Date.now() - hours * 3600e3).toISOString()

function match(over: Partial<ClFixtureRow> = {}): ClData {
  return {
    teams: [{ id: 81, name: 'FC Barcelona', short_name: 'Barça', crest: null }, { id: 5, name: 'FC Bayern', short_name: 'Bayern', crest: null }],
    fixtures: [{
      id: 5001, gameweek_id: 5, kickoff_time: ago(3), team_h: 81, team_a: 5, team_h_score: 2, team_a_score: 1,
      started: true, finished_provisional: true, finished: true, ...over,
    }],
  }
}
const upcoming = (over: Partial<ClFixtureRow> = {}) => match({
  kickoff_time: ago(-24), team_h_score: null, team_a_score: null, started: false, finished_provisional: false, finished: false, ...over,
})

async function ok(p: PromiseLike<{ error: unknown }>) {
  const { error } = await p
  if (error) throw error
}

/** A fresh user, the match still to be played, and the user's tip on it. */
async function setup(home = 2, away = 1, over: Partial<ClFixtureRow> = {}): Promise<string> {
  await ok(db.from('cl_match_tips').delete().gte('fixture_id', 0))
  await ok(db.from('cl_fixtures').delete().gte('id', 0))
  await ok(db.from('cl_teams').delete().gte('id', 0))
  const { data: users } = await db.auth.admin.listUsers()
  for (const u of users.users) await db.auth.admin.deleteUser(u.id)
  const { data } = await db.auth.admin.createUser({ email: 'cl_alfa@test.local', password: 'heslo12345', email_confirm: true })
  await ok(db.from('profiles').insert({ id: data.user!.id, nickname: 'cl_alfa' }))
  await runClSync(db, upcoming(over))
  await ok(db.from('cl_match_tips').insert({ user_id: data.user!.id, fixture_id: 5001, home_goals: home, away_goals: away }))
  return data.user!.id
}

async function tip() {
  const { data, error } = await db.from('cl_match_tips').select('home_goals, away_goals, points, is_final').eq('fixture_id', 5001)
  if (error) throw error
  assertEquals(data.length, 1)
  return data[0]
}

Deno.test('cl: exact score 6 IQ, right winner 3, wrong 0', async () => {
  for (const [h, a, points] of [[2, 1, 6], [1, 0, 3], [0, 0, 0]]) {
    await setup(h, a)
    assertEquals(await runClSync(db, match()), { fixtures: 1, scored: 1 })
    assertEquals(await tip(), { home_goals: h, away_goals: a, points, is_final: true })
  }
})

Deno.test('cl: running twice changes nothing', async () => {
  await setup()
  await runClSync(db, match())
  assertEquals(await runClSync(db, match()), { fixtures: 1, scored: 0 })
  assertEquals((await tip()).points, 6)
})

Deno.test('cl: a corrected score rescores', async () => {
  await setup()
  await runClSync(db, match())
  await runClSync(db, match({ team_a_score: 2 }))
  assertEquals((await tip()).points, 0)
})

Deno.test('cl: an old finished match is scored once, late corrections are ignored', async () => {
  await setup()
  const old = ago(30 * 24)
  await runClSync(db, match({ kickoff_time: old }))
  assertEquals((await tip()).points, 6)
  await runClSync(db, match({ kickoff_time: old, team_a_score: 2 }))
  assertEquals((await tip()).points, 6)
})

Deno.test('cl: a match that is no longer finished loses its points', async () => {
  await setup()
  await runClSync(db, match())
  await runClSync(db, upcoming({ kickoff_time: null }))
  assertEquals(await tip(), { home_goals: 2, away_goals: 1, points: null, is_final: false })
})

Deno.test('cl: an unfinished match has no points', async () => {
  await setup()
  assertEquals(await runClSync(db, match({ finished: false, finished_provisional: false })), { fixtures: 1, scored: 0 })
  assertEquals((await tip()).points, null)
})

Deno.test('cl: an empty answer deletes nothing', async () => {
  await setup()
  await runClSync(db, match())
  assertEquals(await runClSync(db, { teams: [], fixtures: [] }), { fixtures: 0, scored: 0 })
  assertEquals((await tip()).points, 6)
})

Deno.test('cl: without a key nothing is fetched', async () => {
  let called = false
  const result = await syncChampionsLeague(db, undefined, () => (called = true, Promise.resolve(match())))
  assertEquals([result, called], [{ skipped: true }, false])
})

Deno.test('cl: a failing source is reported, not thrown, and keeps the points', async () => {
  await setup()
  await runClSync(db, match())
  const result = await syncChampionsLeague(db, 'key', () => Promise.reject(new Error('football-data → 429')))
  assert('error' in result && result.error.includes('429'))
  assertEquals((await tip()).points, 6)
})
