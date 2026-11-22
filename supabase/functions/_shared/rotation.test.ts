import { assertEquals } from 'jsr:@std/assert@1'
import { CATALOG, CATEGORIES } from './catalog.ts'
import { eligibleKeys } from './rotation.ts'

Deno.test('eligibleKeys returns the whole catalog in a single round', () =>
  assertEquals(eligibleKeys(false), CATALOG.map((t) => t.key)))
Deno.test('eligibleKeys drops double-gameweek-unsafe tips', () => {
  const keys = eligibleKeys(true)
  assertEquals(keys.includes('player_super_sub'), false)
  assertEquals(keys.includes('team_xg_over'), false)
  assertEquals(keys.includes('player_goal'), true)
})
Deno.test('every tip has a known category', () =>
  assertEquals(CATALOG.every((t) => CATEGORIES.some((c) => c.key === t.category)), true))
