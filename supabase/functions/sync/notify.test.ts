import { assertEquals } from 'jsr:@std/assert@1'
import { dueNotices, type NotifyFixture } from './notify.ts'

const now = Date.parse('2026-11-20T12:00:00Z')
const at = (h: number) => new Date(now + h * 3600e3).toISOString()
const fx = (id: number, gw: number, h: number, over: Partial<NotifyFixture> = {}): NotifyFixture =>
  ({ id, gameweek_id: gw, kickoff_time: at(h), started: h < 0, finished: h < -2, ...over })

Deno.test('reminder 24 h before the first match, only to users with untipped matches', () => {
  const fixtures = [fx(1, 12, 20), fx(2, 12, 30), fx(3, 13, 200)]
  const tips = [{ user_id: 'a', fixture_id: 1 }, { user_id: 'a', fixture_id: 2 }, { user_id: 'b', fixture_id: 1 }]
  const out = dueNotices(fixtures, tips, ['a', 'b', 'c'], new Set(), now)
  assertEquals(out.map((n) => `${n.gameweek}:${n.kind}`), ['12:reminder'])
  assertEquals([...out[0].messages.keys()], ['b', 'c'])
  assertEquals(out[0].messages.get('b')!.body, 'Ešte nemáš natipované 1 zápas.')
  assertEquals(out[0].messages.get('c')!.body, 'Ešte nemáš natipované 2 zápasy.')
})

Deno.test('no reminder once the round started, or when already sent', () => {
  assertEquals(dueNotices([fx(1, 12, -1), fx(2, 12, 5)], [], ['a'], new Set(), now), [])
  assertEquals(dueNotices([fx(1, 12, 5)], [], ['a'], new Set(['12:reminder']), now), [])
})

Deno.test('results once every match of the round is finished', () => {
  assertEquals(dueNotices([fx(1, 11, -30), fx(2, 11, -1)], [], ['a'], new Set(), now), [])
  const out = dueNotices([fx(1, 11, -30), fx(2, 11, -5)], [], ['a'], new Set(), now)
  assertEquals(out.map((n) => `${n.gameweek}:${n.kind}`), ['11:results'])
  assertEquals(out[0].messages.get('a')!.url, '/tabulky')
  assertEquals(dueNotices([fx(1, 11, -30)], [], ['a'], new Set(['11:results']), now), [])
})

Deno.test('reminder warns about an injured lineup player', () => {
  const fixtures = [fx(1, 12, 20), fx(2, 12, 30)]
  const tips = [{ user_id: 'a', fixture_id: 1 }, { user_id: 'a', fixture_id: 2 }]
  const m = dueNotices(fixtures, tips, ['a', 'b', 'c'], new Set(), now, new Set(['a', 'b']))[0].messages
  assertEquals(m.get('a')!.body, 'V zostave máš zraneného hráča.')
  assertEquals(m.get('a')!.url, '/klub')
  assertEquals(m.get('b')!.body, 'Ešte nemáš natipované 2 zápasy. V zostave máš zraneného hráča.')
  assertEquals(m.get('b')!.url, '/')
  assertEquals(m.get('c')!.body, 'Ešte nemáš natipované 2 zápasy.')
})
