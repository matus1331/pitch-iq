export const MAX_LEVEL = 50

// Reaching level L takes 10(L-1) + floor(0.3(L-1)(L-2)) IQ: each level costs 10 IQ plus a bit more
// every level (10, 10, 11, 12 ... 39). Level 50 (1195 IQ) is a great full season at ~31 IQ per round
// with 3 IQ per right result and 6 per exact score.
const threshold = (level: number) => 10 * (level - 1) + Math.floor((3 * (level - 1) * (level - 2)) / 10)

export const TITLES = [
  { from: 1, title: 'Rookie', about: 'začínajúci tipér' },
  { from: 5, title: 'Scout', about: 'futbalový pozorovateľ' },
  { from: 10, title: 'Analyst', about: 'analytik' },
  { from: 15, title: 'Tactician', about: 'taktik' },
  { from: 20, title: 'Strategist', about: 'stratég' },
  { from: 25, title: 'Pundit', about: 'televízny expert' },
  { from: 30, title: 'Mastermind', about: 'futbalový génius' },
  { from: 35, title: 'Gaffer', about: 'tréner, ktorý vidí všetko' },
  { from: 40, title: 'Oracle', about: 'veštec' },
  { from: 45, title: 'Hall of Famer', about: 'člen siene slávy' },
  { from: 50, title: 'PitchIQ Legend', about: 'absolútna špička' },
]

export function levelFor(iq: number) {
  let level = 1
  while (level < MAX_LEVEL && iq >= threshold(level + 1)) level++
  const { title, about } = TITLES.findLast((t) => level >= t.from)!
  return {
    level,
    title,
    about,
    progress: iq - threshold(level),
    needed: level === MAX_LEVEL ? null : threshold(level + 1) - threshold(level),
  }
}

export interface IqStep { gameweek_id: number; points: number }

/**
 * Current IQ and the highest IQ ever reached. Levels come from the peak, so a lost duel never
 * costs a level. Within a round the tips count first, then the duel result.
 */
export function iqTotals(tips: IqStep[], duels: IqStep[]): { total: number; peak: number } {
  const rounds = [...new Set([...tips, ...duels].map((s) => s.gameweek_id))].sort((a, b) => a - b)
  const sum = (steps: IqStep[], gw: number) => steps.filter((s) => s.gameweek_id === gw).reduce((n, s) => n + s.points, 0)
  let total = 0, peak = 0
  for (const gw of rounds) {
    total += sum(tips, gw)
    peak = Math.max(peak, total)
    total += sum(duels, gw)
    peak = Math.max(peak, total)
  }
  return { total, peak }
}
