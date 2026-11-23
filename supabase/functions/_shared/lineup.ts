export type Slot = 'gk' | 'def' | 'mid' | 'fwd' | 'flex'
type Pick = { slot: Slot; player_id: number }
type Info = { team_id: number; position: number; status: string }

export const SLOTS: { slot: Slot; label: string; positions: number[] }[] = [
  { slot: 'gk', label: 'Brankár', positions: [1] },
  { slot: 'def', label: 'Obranca', positions: [2] },
  { slot: 'mid', label: 'Stredopoliar', positions: [3] },
  { slot: 'fwd', label: 'Útočník', positions: [4] },
  { slot: 'flex', label: 'Voľný', positions: [2, 3, 4] },
]

const UNPICKABLE = ['i', 's', 'u', 'n']
export const isPickable = (status: string): boolean => !UNPICKABLE.includes(status)

export function carryOver(prev: Pick[], players: Map<number, Info>, club: number): Pick[] {
  return prev.filter((p) => {
    const info = players.get(p.player_id)
    return !!info && info.team_id === club && isPickable(info.status) &&
      SLOTS.find((s) => s.slot === p.slot)!.positions.includes(info.position)
  })
}

export const lineupPoints = (
  playerId: number,
  stats: Map<number, { total_points?: number | null }>,
): number => stats.get(playerId)?.total_points ?? 0
