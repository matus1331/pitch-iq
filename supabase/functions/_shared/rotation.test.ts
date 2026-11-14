import { assert, assertEquals } from 'jsr:@std/assert@1'
import { CATALOG_BY_KEY } from './catalog.ts'
import { drawOffer } from './rotation.ts'

function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

Deno.test('offer has 6 unique keys: 3 player + 3 team', () => {
  for (let i = 0; i < 200; i++) {
    const keys = drawOffer([], false, seeded(i))
    assertEquals(keys.length, 6)
    assertEquals(new Set(keys).size, 6)
    assertEquals(keys.filter((k) => CATALOG_BY_KEY[k].kind === 'player').length, 3)
    assertEquals(keys.filter((k) => CATALOG_BY_KEY[k].kind === 'team').length, 3)
  }
})

Deno.test('offer avoids the previous offer', () => {
  for (let i = 0; i < 200; i++) {
    const prev = drawOffer([], false, seeded(i))
    const next = drawOffer(prev, false, seeded(i + 1000))
    assertEquals(next.filter((k) => prev.includes(k)), [])
  }
})

Deno.test('double gameweek offer excludes non-separable tips', () => {
  for (let i = 0; i < 200; i++) {
    const keys = drawOffer([], true, seeded(i))
    assert(keys.every((k) => !CATALOG_BY_KEY[k].excludedInDoubleGw), keys.join(','))
    assertEquals(keys.length, 6)
  }
})

Deno.test('double gameweek with previous offer still fills 6 (reuses previous when needed)', () => {
  for (let i = 0; i < 200; i++) {
    const prev = drawOffer([], true, seeded(i))
    const next = drawOffer(prev, true, seeded(i + 7))
    assertEquals(next.length, 6)
    assertEquals(new Set(next).size, 6)
  }
})
