import { assertEquals } from 'jsr:@std/assert@1'
import { carryOver, isPickable, lineupPoints } from './lineup.ts'

const players = new Map([
  [1, { team_id: 7, position: 1, status: 'a' }],
  [2, { team_id: 7, position: 2, status: 'i' }],
  [3, { team_id: 9, position: 3, status: 'a' }],
  [4, { team_id: 7, position: 4, status: 'd' }],
  [5, { team_id: 7, position: 1, status: 'a' }],
])

Deno.test('carryOver keeps valid, drops injured, transferred and wrong-position, keeps doubtful', () => {
  const prev = [
    { slot: 'gk' as const, player_id: 1 },
    { slot: 'def' as const, player_id: 2 },
    { slot: 'mid' as const, player_id: 3 },
    { slot: 'flex' as const, player_id: 4 },
    { slot: 'flex' as const, player_id: 5 },
  ]
  assertEquals(carryOver(prev, players, 7).map((p) => p.player_id), [1, 4])
})
Deno.test('isPickable', () => {
  assertEquals(isPickable('d'), true)
  assertEquals(isPickable('s'), false)
})
Deno.test('lineupPoints', () => {
  assertEquals(lineupPoints(1, new Map([[1, { total_points: -1 }]])), -1)
  assertEquals(lineupPoints(2, new Map()), 0)
})
