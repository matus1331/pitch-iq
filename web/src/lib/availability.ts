export interface PlayerAvailability { status: string; chance_next: number | null; news: string | null; start_pct?: number | null }

const OUT: Record<string, { icon: string; note: string }> = {
  i: { icon: '🚑', note: 'Zranený' },
  s: { icon: '🟥', note: 'Suspendovaný' },
  u: { icon: '⛔', note: 'Nie je k dispozícii' },
  n: { icon: '⛔', note: 'Nie je k dispozícii' },
}

/**
 * How a player stands for the next round, from FPL: status a/d/i/s/u/n, the chance of playing
 * (FPL leaves it empty for fit players) and the news text, e.g. "Hamstring injury - Expected back 30 Nov".
 * FPL's chance only says whether a player is fit, so it is capped by start_pct, the share of the club's
 * league matches he started this season. Players who are out get an icon and no chance.
 */
export interface Role { icon: string; label: string }

/** How often the player starts: 70 % and more is a regular, under 30 % a bench player. */
function roleOf(startPct: number | null | undefined): Role | null {
  if (startPct == null) return null
  if (startPct >= 70) return { icon: '🟢', label: 'Stály hráč' }
  if (startPct >= 30) return { icon: '🟡', label: 'Občas hrá' }
  return { icon: '⚪', label: 'Náhradník' }
}

export function availability(p: PlayerAvailability):
  { icon: string | null; chance: number | null; note: string | null; role: Role | null } {
  const out = OUT[p.status]
  if (out) return { icon: out.icon, chance: null, note: p.news || out.note, role: null }
  return { icon: null, chance: Math.min(p.chance_next ?? 100, p.start_pct ?? 100), note: p.news || null, role: roleOf(p.start_pct) }
}
