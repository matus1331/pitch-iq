interface F { gameweek_id: number | null; started: boolean }

/** Fixtures of the chosen round, plus postponed ones (FPL gives them no round). */
export function splitRound<T extends F>(all: T[], gw: number | undefined) {
  return {
    round: all.filter((f) => f.gameweek_id === gw),
    postponed: all.filter((f) => f.gameweek_id == null),
  }
}

/** First round that still has a match to tip, else the first one. */
export function defaultRound(all: F[], options: number[]): number | undefined {
  return options.find((o) => all.some((f) => f.gameweek_id === o && !f.started)) ?? options[0]
}
