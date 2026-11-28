// Runs against the local stack: `npx supabase start`, then
// SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... deno test --allow-net --allow-env --allow-read supabase/functions/sync
import { assertEquals } from 'jsr:@std/assert@1'
import { createClient } from 'npm:@supabase/supabase-js@2'
import bootstrap from './fixtures/bootstrap.json' with { type: 'json' }
import { eligibleKeys } from '../_shared/rotation.ts'
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
type Explain = { fixture: number; stats: { identifier: string; value: number; points: number }[] }[]
const played90 = { identifier: 'minutes', value: 90, points: 2 }
function el(id: number, s: Record<string, number | string>, explain: Explain = [{ fixture: 1001, stats: [played90] }]) {
  return {
    id,
    stats: {
      minutes: 90, starts: 1, goals_scored: 0, assists: 0, yellow_cards: 0, red_cards: 0, own_goals: 0,
      saves: 0, bonus: 0, penalties_missed: 0, penalties_saved: 0, tackles: 0, expected_goals: '0.00', total_points: 2, ...s,
    },
    explain,
  }
}
function live(scorer: number): unknown {
  return {
    elements: [
      el(PICKFORD, { saves: 4, total_points: 3 }),
      el(JOHNSON, { goals_scored: scorer === JOHNSON ? 2 : 0, total_points: scorer === JOHNSON ? 12 : 2 }),
      el(21, { goals_scored: scorer === 21 ? 2 : 0 }),
      el(GABRIEL, { goals_scored: 1, total_points: 8 }),
    ],
  }
}
const bootstrapNow = { ...bootstrap, events: bootstrap.events.map((e) => ({ ...e, is_current: e.id === GW, is_next: e.id === GW + 1 })) }
function api(fixtures: Fx[], scorer = JOHNSON, over: { live?: unknown; boot?: unknown } = {}): FplApi {
  return {
    fetchBootstrap: () => Promise.resolve(over.boot ?? bootstrapNow),
    fetchFixtures: () => Promise.resolve(fixtures),
    fetchLive: () => Promise.resolve(over.live ?? live(scorer)),
  }
}

async function reset(): Promise<{ alfa: string }> {
  await db.from('club_lineups').delete().gte('fixture_id', 0)
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
  assertEquals((await points('match_tips', 1001))[0].points, 6)
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
  assertEquals((await points('match_tips', 1001))[0].points, 6)
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

Deno.test('offer is created once for upcoming match of an owned club', async () => {
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

async function addUser(nickname: string, club: number | null): Promise<string> {
  const { data } = await db.auth.admin.createUser({ email: `${nickname}@test.local`, password: 'heslo12345', email_confirm: true })
  await ok(db.from('profiles').insert({ id: data.user!.id, nickname, club_team_id: club }))
  return data.user!.id
}

Deno.test('finished round settles accepted duels, underdog winner gets a bonus', async () => {
  const { alfa } = await reset()
  const beta = await addUser('beta', ARS)
  // An older round (outside the rescoring window): beta banks 60 IQ (level 5), alfa nothing (level 1).
  await runSync(db, api([fixture(1002, { event: GW - 2 }), fixture(1001)]))
  await ok(db.from('match_tips').insert({ user_id: beta, fixture_id: 1002, kind: '1x2', outcome: 'A', points: 60, is_final: true }))
  // Round GW (EVE 2:1 ARS): alfa hits the exact score, beta misses.
  await ok(db.from('match_tips').insert([
    { user_id: alfa, fixture_id: 1001, kind: 'exact', home_goals: 2, away_goals: 1 },
    { user_id: beta, fixture_id: 1001, kind: '1x2', outcome: 'A' },
  ]))
  await ok(db.from('duels').insert({ gameweek_id: GW, challenger_id: beta, opponent_id: alfa, stake: 10, status: 'accepted' }))
  await runSync(db, api([fixture(1002, { event: GW - 2 }), fixture(1001)]))
  const { data } = await db.from('duels').select('*').single()
  assertEquals(
    [data!.status, data!.challenger_iq, data!.opponent_iq, data!.challenger_delta, data!.opponent_delta],
    ['finished', 0, 6, -10, 15],
  )
  await runSync(db, api([fixture(1002, { event: GW - 2 }), fixture(1001)]))
  assertEquals((await db.from('duels').select('opponent_delta').single()).data!.opponent_delta, 15) // settled once
})

Deno.test('a club duel ignores result tips', async () => {
  const { alfa } = await reset()
  const beta = await addUser('beta', ARS)
  await ok(db.from('gameweeks').upsert({ id: GW }))
  await runSync(db, api([fixture(1001)]))
  await ok(db.from('match_tips').insert({ user_id: alfa, fixture_id: 1001, kind: 'exact', home_goals: 2, away_goals: 1, points: 5 }))
  await ok(db.from('duels').insert({ gameweek_id: GW, challenger_id: alfa, opponent_id: beta, stake: 5, status: 'accepted', category: 'club' }))
  await runSync(db, api([fixture(1001)]))
  const { data } = await db.from('duels').select('challenger_iq, opponent_iq, challenger_delta').single()
  assertEquals([data!.challenger_iq, data!.opponent_iq, data!.challenger_delta], [0, 0, 0])
})

Deno.test('a draw moves no IQ, an unfinished round waits', async () => {
  const { alfa } = await reset()
  const beta = await addUser('beta', ARS)
  await ok(db.from('gameweeks').upsert({ id: GW }))
  await ok(db.from('duels').insert({ gameweek_id: GW, challenger_id: alfa, opponent_id: beta, stake: 5, status: 'accepted' }))
  await runSync(db, api([fixture(1001, { finished: false, finished_provisional: false })]))
  assertEquals((await db.from('duels').select('status').single()).data!.status, 'accepted')
  await runSync(db, api([fixture(1001)]))
  const { data } = await db.from('duels').select('status, challenger_delta, opponent_delta').single()
  assertEquals([data!.status, data!.challenger_delta, data!.opponent_delta], ['finished', 0, 0])
})

Deno.test('an unanswered challenge expires once the round starts', async () => {
  const { alfa } = await reset()
  const beta = await addUser('beta', ARS)
  await ok(db.from('gameweeks').upsert({ id: GW }))
  await ok(db.from('duels').insert({ gameweek_id: GW, challenger_id: alfa, opponent_id: beta, stake: 5 }))
  await runSync(db, api([fixture(1001, { kickoff_time: future, started: false, finished_provisional: false, finished: false })]))
  assertEquals((await db.from('duels').select('status').single()).data!.status, 'pending')
  await runSync(db, api([fixture(1001, { finished: false, finished_provisional: false })]))
  assertEquals((await db.from('duels').select('status').single()).data!.status, 'expired')
})

Deno.test('a match duel settles in Rešpekt when its match is finished', async () => {
  const { alfa } = await reset()
  const beta = await addUser('beta', ARS)
  await ok(db.from('gameweeks').upsert({ id: GW }))
  await runSync(db, api([fixture(1001, { finished: false, finished_provisional: false })]))
  // EVE 2:1 ARS. beta took the away win, alfa the double chance 1X and wins half the stake.
  const { data: duel } = await db.from('duels').insert({
    gameweek_id: GW, challenger_id: alfa, opponent_id: beta, stake: 10, status: 'accepted', category: 'match', fixture_id: 1001,
  }).select().single()
  await ok(db.from('duel_picks').insert([{ duel_id: duel!.id, user_id: alfa, pick: 'HD' }, { duel_id: duel!.id, user_id: beta, pick: 'A' }]))
  await runSync(db, api([fixture(1001, { finished: false, finished_provisional: false })]))
  assertEquals((await db.from('duels').select('status').single()).data!.status, 'accepted')
  await runSync(db, api([fixture(1001)]))
  const { data } = await db.from('duels').select('status, challenger_delta, opponent_delta').single()
  assertEquals([data!.status, data!.challenger_delta, data!.opponent_delta], ['finished', 5, -5])
})

Deno.test('an unanswered match duel expires at kickoff, a postponed one is voided', async () => {
  const { alfa } = await reset()
  const beta = await addUser('beta', ARS)
  await ok(db.from('gameweeks').upsert({ id: GW }))
  const upcoming = { kickoff_time: future, started: false, finished_provisional: false, finished: false }
  await runSync(db, api([fixture(1001, upcoming), fixture(1002, upcoming)]))
  await ok(db.from('duels').insert([
    { gameweek_id: GW, challenger_id: alfa, opponent_id: beta, stake: 5, status: 'pending', category: 'match', fixture_id: 1001 },
    { gameweek_id: GW, challenger_id: beta, opponent_id: alfa, stake: 5, status: 'pending', category: 'match', fixture_id: 1002 },
  ]))
  await runSync(db, api([fixture(1001, { finished: false, finished_provisional: false }), fixture(1002, { ...upcoming, kickoff_time: null })]))
  const { data } = await db.from('duels').select('fixture_id, status').order('fixture_id')
  assertEquals(data!.map((d) => d.status), ['expired', 'cancelled'])
})

const upcoming = { kickoff_time: future, started: false, finished_provisional: false, finished: false, team_h_score: null, team_a_score: null }
const running = { finished_provisional: false, finished: false }
const six = ['player_goal', 'player_brace', 'player_yellow', 'team_saves_over', 'team_red', 'match_own_goal']
const TARKOWSKI = 229, BARRY = 249, DEWSBURY = 236, TRAVERS = 227
const earlier = new Date(Date.now() - 4 * 86400e3).toISOString()

async function statsOf(player: number, fixtureId: number) {
  const { data } = await db.from('player_match_stats').select('stats').eq('player_id', player).eq('fixture_id', fixtureId).single()
  return data!.stats
}
async function lineup(user: string, fixtureId: number, picks: [string, number][]) {
  await ok(db.from('club_lineups').insert(picks.map(([slot, player_id]) => ({ user_id: user, fixture_id: fixtureId, slot, player_id }))))
}
async function lineupRows(fixtureId: number) {
  const { data } = await db.from('club_lineups').select('slot, player_id, points, is_final').eq('fixture_id', fixtureId).order('slot')
  return data!
}
const fullLineup: [string, number][] = [['gk', PICKFORD], ['def', TARKOWSKI], ['mid', JOHNSON], ['fwd', BARRY], ['flex', DEWSBURY]]

Deno.test('stores total points and the per-fixture breakdown', async () => {
  await reset()
  await runSync(db, api([fixture(1001)]))
  const s = await statsOf(PICKFORD, 1001)
  assertEquals([s.total_points, s.breakdown], [3, [played90]])
})

Deno.test('double gameweek scores each match from its own explain entry', async () => {
  await reset()
  const saves = { identifier: 'saves', value: 3, points: 1 }
  const conceded = { identifier: 'goals_conceded', value: 4, points: -2 }
  const liveDouble = { elements: [el(PICKFORD, { total_points: 3 }, [
    { fixture: 1001, stats: [played90, saves] },
    { fixture: 1002, stats: [played90, conceded] },
  ])] }
  await runSync(db, api([fixture(1001), fixture(1002, { team_h: ARS, team_a: EVE })], JOHNSON, { live: liveDouble }))
  const a = await statsOf(PICKFORD, 1001), b = await statsOf(PICKFORD, 1002)
  assertEquals([a.total_points, a.breakdown, b.total_points, b.breakdown], [3, [played90, saves], 0, [played90, conceded]])
})

Deno.test('offers every eligible tip and widens an old six', async () => {
  await reset()
  const fixtures = [fixture(1001, upcoming), fixture(1002, { event: GW - 1, ...running })]
  await runSync(db, api(fixtures))
  await ok(db.from('club_tip_offers').update({ tip_keys: six }).eq('fixture_id', 1001))
  await ok(db.from('club_tip_offers').insert({ fixture_id: 1002, team_id: EVE, tip_keys: six }))
  await runSync(db, api(fixtures))
  const { data } = await db.from('club_tip_offers').select('fixture_id, tip_keys').order('fixture_id')
  assertEquals(data!.map((o) => o.tip_keys), [eligibleKeys(false), six])
})

Deno.test('copies the last lineup at kickoff, skipping injured players', async () => {
  const { alfa } = await reset()
  const fixtures = [fixture(1001, { event: GW - 1, kickoff_time: earlier }), fixture(1002, upcoming)]
  await runSync(db, api(fixtures))
  await lineup(alfa, 1001, fullLineup)
  const injured = { ...bootstrapNow, elements: bootstrapNow.elements.map((e) => e.id === TARKOWSKI ? { ...e, status: 'i' } : e) }
  await runSync(db, api([fixtures[0], fixture(1002, running)], JOHNSON, { boot: injured }))
  assertEquals((await lineupRows(1002)).map((r) => r.slot), ['flex', 'fwd', 'gk', 'mid'])
})

Deno.test('carries a lineup over to a match first seen already finished', async () => {
  const { alfa } = await reset()
  const first = fixture(1001, { event: GW - 1, kickoff_time: earlier })
  await runSync(db, api([first, fixture(1002, upcoming)]))
  await lineup(alfa, 1001, fullLineup)
  // No sync ran while 1002 was live: it shows up finished.
  await runSync(db, api([first, fixture(1002, { finished: true })]))
  const rows = await lineupRows(1002)
  assertEquals(rows.map((r) => r.slot), ['def', 'flex', 'fwd', 'gk', 'mid'])
  assertEquals(rows.every((r) => r.points != null && r.is_final), true)
})

Deno.test('does not overwrite a saved lineup', async () => {
  const { alfa } = await reset()
  const fixtures = [fixture(1001, { event: GW - 1, kickoff_time: earlier }), fixture(1002, upcoming)]
  await runSync(db, api(fixtures))
  await lineup(alfa, 1001, fullLineup)
  await lineup(alfa, 1002, [['gk', TRAVERS]])
  await runSync(db, api([fixtures[0], fixture(1002, running)]))
  assertEquals((await lineupRows(1002)).map((r) => r.player_id), [TRAVERS])
})

Deno.test('scores lineups from FPL points, missing player gets 0', async () => {
  const { alfa } = await reset()
  await runSync(db, api([fixture(1001, upcoming)]))
  await lineup(alfa, 1001, [['gk', PICKFORD], ['mid', JOHNSON], ['fwd', BARRY]])
  await runSync(db, api([fixture(1001, { finished: false })]))
  assertEquals((await lineupRows(1001)).map((r) => [r.slot, r.points, r.is_final]), [['fwd', 0, false], ['gk', 3, false], ['mid', 12, false]])
  await runSync(db, api([fixture(1001)]))
  assertEquals((await lineupRows(1001)).map((r) => r.is_final), [true, true, true])
})

Deno.test('postponed match voids lineups', async () => {
  const { alfa } = await reset()
  await runSync(db, api([fixture(1001, upcoming)]))
  await lineup(alfa, 1001, [['gk', PICKFORD]])
  await runSync(db, api([fixture(1001, { ...upcoming, event: null, kickoff_time: null })]))
  assertEquals((await lineupRows(1001)).map((r) => [r.points, r.is_final]), [[0, true]])
})
