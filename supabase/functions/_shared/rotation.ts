import { CATALOG, type TipKind } from './catalog.ts'

function shuffle<T>(items: T[], rng: () => number): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** 3 player + 3 team tip keys; prefers keys not in previousKeys, falls back to them only when needed. */
export function drawOffer(previousKeys: string[], isDoubleGw: boolean, rng: () => number): string[] {
  const pick = (kind: TipKind) => {
    const pool = CATALOG.filter((t) => t.kind === kind && !(isDoubleGw && t.excludedInDoubleGw)).map((t) => t.key)
    const fresh = shuffle(pool.filter((k) => !previousKeys.includes(k)), rng)
    const reused = shuffle(pool.filter((k) => previousKeys.includes(k)), rng)
    return [...fresh, ...reused].slice(0, 3)
  }
  return [...pick('player'), ...pick('team')]
}
