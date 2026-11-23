/** Sorts rows by a column: text A-Z, numbers high to low first; empty values always last. */
export function sortRows<T>(rows: T[], get: (r: T) => string | number | null, dir: 1 | -1): T[] {
  return [...rows].sort((a, b) => {
    const x = get(a), y = get(b)
    if (x == null || y == null) return x == null && y == null ? 0 : x == null ? 1 : -1
    return (typeof x === 'string' ? x.localeCompare(y as string, 'sk') : x - (y as number)) * dir
  })
}
