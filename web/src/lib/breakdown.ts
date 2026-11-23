export interface BreakdownRow { identifier: string; value: number; points: number }

const LABELS: Record<string, string> = {
  minutes: 'Odohrané minúty',
  goals_scored: 'Gól',
  assists: 'Asistencia',
  clean_sheets: 'Čisté konto',
  goals_conceded: 'Inkasované góly',
  own_goals: 'Vlastný gól',
  penalties_saved: 'Chytená penalta',
  penalties_missed: 'Nepremenená penalta',
  yellow_cards: 'Žltá karta',
  red_cards: 'Červená karta',
  saves: 'Zákroky',
  bonus: 'Bonus',
  defensive_contribution: 'Obranná práca',
}

/** Slovak name of an FPL `explain` identifier; unknown ones stay as FPL sends them. */
export const breakdownLabel = (identifier: string): string => LABELS[identifier] ?? identifier

/** FPL points of one match in words, e.g. "Gól +5 · Asistencia +3 · Žltá karta −1". */
export const formatBreakdown = (rows: BreakdownRow[]): string =>
  rows.filter((r) => r.points !== 0)
    .map((r) => `${breakdownLabel(r.identifier)} ${r.points > 0 ? '+' : '−'}${Math.abs(r.points)}`)
    .join(' · ')
