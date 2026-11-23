// Local testing only: pretend one round has been played, on top of the real FPL data.
// Switched on by app_config 'sim_round' (see scripts/sim-round.sh); production never sets it.
// Everything is seeded by fixture id, so every sync run (cron included) sees the same results.
import type { FplApi } from './sync.ts'

// deno-lint-ignore no-explicit-any
type Json = any

function rng(seed: number) {
  let a = seed * 2654435761 >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const int = (r: () => number, max: number) => Math.floor(r() * (max + 1))
const pick = <T>(r: () => number, items: T[]) => items[Math.floor(r() * items.length)]
const GOALS = [0, 0, 1, 1, 1, 2, 2, 2, 3, 4] // a plausible spread of team goals

function score(f: Json) {
  const r = rng(f.id)
  return { team_h_score: pick(r, GOALS), team_a_score: pick(r, GOALS) }
}

/** One team's players in one simulated match; goal count matches the simulated score. */
function teamStats(fixtureId: number, team: number, goals: number, conceded: number, squad: Json[]) {
  const r = rng(fixtureId * 31 + team)
  const byPos = (p: number) => squad.filter((e) => e.team === team && e.element_type === p)
  const starters = [...byPos(1).slice(0, 1), ...byPos(2).slice(0, 4), ...byPos(3).slice(0, 4), ...byPos(4).slice(0, 2)]
  const subs = squad.filter((e) => e.team === team && e.element_type !== 1 && !starters.includes(e)).slice(0, 3)
  const stats = new Map<number, Json>()
  for (const e of [...starters, ...subs]) {
    const start = starters.includes(e)
    stats.set(e.id, {
      minutes: start ? (r() < 0.2 ? 60 + int(r, 25) : 90) : 10 + int(r, 25),
      starts: start ? 1 : 0, goals_scored: 0, assists: 0, yellow_cards: r() < 0.12 ? 1 : 0,
      red_cards: r() < 0.02 ? 1 : 0, own_goals: 0, bonus: 0, penalties_missed: 0, penalties_saved: 0,
      saves: e.element_type === 1 ? 1 + int(r, 5) : 0, tackles: e.element_type === 1 ? 0 : int(r, 5),
      expected_goals: (r() * 0.3).toFixed(2),
    })
  }
  const outfield = [...stats.keys()].filter((id) => squad.find((e) => e.id === id).element_type !== 1)
  // Forwards score most, defenders least.
  const weighted = outfield.flatMap((id) => Array(squad.find((e) => e.id === id).element_type).fill(id))
  for (let g = 0; g < goals; g++) {
    const scorer = pick(r, weighted)
    const s = stats.get(scorer)
    s.goals_scored++
    s.expected_goals = (Number(s.expected_goals) + 0.4 + r() * 0.4).toFixed(2)
    if (r() < 0.7) stats.get(pick(r, outfield.filter((id) => id !== scorer))).assists++
  }
  const gk = starters.find((e) => e.element_type === 1)
  if (gk && conceded === 0) stats.get(gk.id).saves += 2
  return stats
}

const GOAL_POINTS = [0, 6, 6, 5, 4] // by element_type: GK, DEF, MID, FWD

/** FPL scoring (simplified) for one simulated player, as FPL's `explain` rows; rows worth nothing are left out. */
function explainRows(s: Json, pos: number, conceded: number) {
  const full = s.minutes >= 60
  const rows: [string, number, number][] = [
    ['minutes', s.minutes, full ? 2 : 1],
    ['goals_scored', s.goals_scored, s.goals_scored * GOAL_POINTS[pos]],
    ['assists', s.assists, s.assists * 3],
    ['clean_sheets', conceded === 0 && full ? 1 : 0, conceded === 0 && full ? (pos <= 2 ? 4 : pos === 3 ? 1 : 0) : 0],
    ['goals_conceded', conceded, pos <= 2 ? -Math.floor(conceded / 2) : 0],
    ['saves', s.saves, Math.floor(s.saves / 3)],
    ['yellow_cards', s.yellow_cards, -s.yellow_cards],
    ['red_cards', s.red_cards, -3 * s.red_cards],
    ['bonus', s.bonus, s.bonus],
  ]
  return rows.filter(([, , points]) => points !== 0).map(([identifier, value, points]) => ({ identifier, value, points }))
}

export function simulateRound(real: FplApi, gw: number): FplApi {
  return {
    async fetchBootstrap() {
      const boot = await real.fetchBootstrap()
      return {
        ...boot,
        events: boot.events.map((e: Json) => ({
          ...e, is_current: e.id === gw, is_next: e.id === gw + 1, finished: e.id <= gw,
        })),
      }
    },
    async fetchFixtures() {
      const all = await real.fetchFixtures()
      // Shift the round into the past (order kept, last kickoff 3 h ago) so tips lock and everyone's show.
      const last = Math.max(...all.filter((f: Json) => f.event === gw && f.kickoff_time).map((f: Json) => Date.parse(f.kickoff_time)))
      const shift = last - (Date.now() - 3 * 3600e3)
      return all.map((f: Json) => f.event !== gw ? f : {
        ...f, ...score(f), started: true, finished_provisional: true, finished: true,
        kickoff_time: f.kickoff_time && new Date(Date.parse(f.kickoff_time) - shift).toISOString(),
      })
    },
    async fetchLive(round: number) {
      if (round !== gw) return real.fetchLive(round)
      const [boot, fixtures] = [await real.fetchBootstrap(), await this.fetchFixtures()]
      const elements: Json[] = []
      for (const f of fixtures.filter((x: Json) => x.event === gw)) {
        const all = [teamStats(f.id, f.team_h, f.team_h_score, f.team_a_score, boot.elements),
          teamStats(f.id, f.team_a, f.team_a_score, f.team_h_score, boot.elements)]
        // Bonus: the match's three best attacking returns get 3, 2, 1.
        const ranked = all.flatMap((m) => [...m.entries()])
          .sort((x, y) => (y[1].goals_scored * 3 + y[1].assists) - (x[1].goals_scored * 3 + x[1].assists))
        ranked.slice(0, 3).forEach(([, s], i) => { if (s.goals_scored + s.assists > 0) s.bonus = 3 - i })
        const conceded = [f.team_a_score, f.team_h_score]
        all.forEach((m, side) => {
          for (const [id, stats] of m) {
            const rows = explainRows(stats, boot.elements.find((e: Json) => e.id === id).element_type, conceded[side])
            stats.total_points = rows.reduce((n, r) => n + r.points, 0)
            elements.push({ id, stats, explain: [{ fixture: f.id, stats: rows }] })
          }
        })
      }
      return { elements }
    },
  }
}
