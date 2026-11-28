import { assertEquals } from 'jsr:@std/assert@1'
import { matchDuelDeltas, sideOf } from './duel.ts'

Deno.test('match duel payouts', () => {
  assertEquals(sideOf(2, 1), 'H')
  assertEquals(sideOf(1, 1), 'D')
  // A on 2, B on 1: whoever hits takes the stake, a draw decides nothing.
  assertEquals(matchDuelDeltas(10, 'A', 'H', 'A'), { challenger: 10, opponent: -10 })
  assertEquals(matchDuelDeltas(10, 'A', 'H', 'H'), { challenger: -10, opponent: 10 })
  assertEquals(matchDuelDeltas(10, 'A', 'H', 'D'), { challenger: 0, opponent: 0 })
  // A double chance wins (and costs the other) only half.
  assertEquals(matchDuelDeltas(10, 'DA', 'H', 'D'), { challenger: 5, opponent: -5 })
  assertEquals(matchDuelDeltas(5, 'H', 'DA', 'A'), { challenger: -2, opponent: 2 })
  // The single beats the double only if the double missed.
  assertEquals(matchDuelDeltas(10, 'HD', 'A', 'A'), { challenger: -10, opponent: 10 })
  // Both hit, also with different picks, or the same pick: a draw.
  assertEquals(matchDuelDeltas(10, 'H', 'HD', 'H'), { challenger: 0, opponent: 0 })
  assertEquals(matchDuelDeltas(10, 'D', 'D', 'H'), { challenger: 0, opponent: 0 })
  assertEquals(matchDuelDeltas(10, 'D', 'D', 'D'), { challenger: 0, opponent: 0 })
})
