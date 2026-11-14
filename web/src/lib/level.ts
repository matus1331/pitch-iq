export const MAX_LEVEL = 25

// Level L -> L+1 costs 10 + 2(L-1) IQ, so reaching level L takes (L-1)(L+8) IQ in total.
// Level 25 (792 IQ) is a very good full season at ~20 IQ per round.
const threshold = (level: number) => (level - 1) * (level + 8)

export const TITLES = [
  { from: 1, title: 'Rookie', about: 'začínajúci tipér' },
  { from: 5, title: 'Scout', about: 'futbalový pozorovateľ' },
  { from: 10, title: 'Analyst', about: 'analytik' },
  { from: 15, title: 'Tactician', about: 'taktik' },
  { from: 20, title: 'Mastermind', about: 'futbalový génius' },
  { from: 25, title: 'PitchIQ Legend', about: 'absolútna špička' },
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
