export interface Row { user_id: string; nickname: string; points: number }
export interface RoundRow extends Row { gameweek_id: number }

/** Sum per player (optionally for one round); every profile appears, even with 0. */
export function totals(rows: RoundRow[], profiles: { id: string; nickname: string }[], gw: number | null): Row[] {
  const sum = new Map<string, number>()
  for (const r of rows) if (gw == null || r.gameweek_id === gw) sum.set(r.user_id, (sum.get(r.user_id) ?? 0) + r.points)
  return profiles.map((p) => ({ user_id: p.id, nickname: p.nickname, points: sum.get(p.id) ?? 0 }))
}

/** Descending by points; ties share a rank (1, 1, 3); ties ordered by nickname. */
export function rankRows<T extends Row>(rows: T[]): (T & { rank: number })[] {
  const sorted = [...rows].sort((a, b) => b.points - a.points || a.nickname.localeCompare(b.nickname, 'sk'))
  let rank = 0
  return sorted.map((r, i) => {
    if (i === 0 || sorted[i - 1].points !== r.points) rank = i + 1
    return { ...r, rank }
  })
}
