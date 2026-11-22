import { CATALOG } from './catalog.ts'

/** Every tip on offer; a double gameweek drops the tips that cannot be separated per match. */
export function eligibleKeys(isDoubleGw: boolean): string[] {
  return CATALOG.filter((t) => !(isDoubleGw && t.excludedInDoubleGw)).map((t) => t.key)
}
