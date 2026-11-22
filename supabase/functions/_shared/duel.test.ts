import { assertEquals } from 'jsr:@std/assert@1'
import { matchDuelDeltas, sideOf } from './duel.ts'

Deno.test('match duel payouts', () => {
  assertEquals(sideOf(2, 1), 'H')
  assertEquals(sideOf(1, 1), 'D')
  // B on 1, A on 2: a draw decides nothing.
  assertEquals(matchDuelDeltas(10, 'A', 'H', 'A'), { challenger: 10, opponent: -10 })
  assertEquals(matchDuelDeltas(10, 'A', 'H', 'H'), { challenger: -10, opponent: 10 })
  assertEquals(matchDuelDeltas(10, 'A', 'H', 'D'), { challenger: 0, opponent: 0 })
  // A on X2 wins half, loses all.
  assertEquals(matchDuelDeltas(10, 'DA', 'H', 'D'), { challenger: 5, opponent: -5 })
  assertEquals(matchDuelDeltas(5, 'DA', 'H', 'A'), { challenger: 2, opponent: -2 })
  assertEquals(matchDuelDeltas(10, 'DA', 'H', 'H'), { challenger: -10, opponent: 10 })
})
