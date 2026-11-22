export type TipKind = 'player' | 'team'
export type TipCategory = 'goals' | 'cards' | 'defence' | 'performance' | 'match'
export type TipInput = 'player' | 'number' | 'claim'

export interface TipDef {
  key: string
  kind: TipKind
  input: TipInput
  points: number
  label: string
  excludedInDoubleGw: boolean
  category: TipCategory
}

const p = (key: string, category: TipCategory, points: number, label: string, excludedInDoubleGw = false): TipDef =>
  ({ key, kind: 'player', input: 'player', points, label, excludedInDoubleGw, category })
const t = (key: string, category: TipCategory, input: TipInput, points: number, label: string, excludedInDoubleGw = false): TipDef =>
  ({ key, kind: 'team', input, points, label, excludedInDoubleGw, category })

export const CATALOG: TipDef[] = [
  p('player_goal', 'goals', 3, 'Dá gól'),
  p('player_brace', 'goals', 6, 'Dá aspoň 2 góly'),
  p('player_assist', 'goals', 3, 'Bude mať asistenciu'),
  p('player_ga', 'goals', 2, 'Gól alebo asistencia'),
  p('player_yellow', 'cards', 3, 'Dostane žltú kartu'),
  p('player_top_bonus', 'performance', 4, 'Najviac bonusových bodov v klube'),
  p('player_full90', 'performance', 1, 'Odohrá celých 90 minút'),
  p('player_super_sub', 'performance', 3, 'Príde z lavičky a zahrá si', true),
  p('player_top_tackles', 'defence', 3, 'Najviac tacklov v klube', true),
  p('player_top_xg', 'performance', 3, 'Najvyššie xG v klube', true),
  t('team_goals_exact', 'goals', 'number', 2, 'Presný počet strelených gólov'),
  t('team_conceded_exact', 'defence', 'number', 2, 'Presný počet inkasovaných gólov'),
  t('team_clean_sheet', 'defence', 'claim', 2, 'Udržíme čisté konto'),
  t('team_yellows_exact', 'cards', 'number', 2, 'Presný počet žltých kariet'),
  t('team_red', 'cards', 'claim', 3, 'Dostaneme červenú kartu'),
  t('team_sub_goal', 'goals', 'claim', 4, 'Gól dá striedajúci hráč', true),
  t('team_scorers_count', 'goals', 'number', 3, 'Počet rôznych strelcov'),
  t('team_xg_over', 'performance', 'claim', 2, 'xG tímu bude nad 1,5', true),
  t('team_saves_over', 'defence', 'claim', 1, 'Brankár bude mať viac ako 3 zákroky'),
  t('match_penalty_fail', 'match', 'claim', 4, 'V zápase bude nepremenená alebo chytená penalta'),
  t('match_own_goal', 'match', 'claim', 4, 'V zápase padne vlastný gól'),
]

export const CATEGORIES: { key: TipCategory; label: string }[] = [
  { key: 'goals', label: 'Góly' },
  { key: 'cards', label: 'Karty' },
  { key: 'defence', label: 'Obrana' },
  { key: 'performance', label: 'Výkon' },
  { key: 'match', label: 'Zvláštnosti zápasu' },
]

export const CATALOG_BY_KEY: Record<string, TipDef> = Object.fromEntries(CATALOG.map((d) => [d.key, d]))
