export type TipKind = 'player' | 'team'
export type TipInput = 'player' | 'number' | 'claim'

export interface TipDef {
  key: string
  kind: TipKind
  input: TipInput
  points: number
  label: string
  excludedInDoubleGw: boolean
}

const p = (key: string, points: number, label: string, excludedInDoubleGw = false): TipDef =>
  ({ key, kind: 'player', input: 'player', points, label, excludedInDoubleGw })
const t = (key: string, input: TipInput, points: number, label: string, excludedInDoubleGw = false): TipDef =>
  ({ key, kind: 'team', input, points, label, excludedInDoubleGw })

export const CATALOG: TipDef[] = [
  p('player_goal', 3, 'Dá gól'),
  p('player_brace', 6, 'Dá aspoň 2 góly'),
  p('player_assist', 3, 'Bude mať asistenciu'),
  p('player_ga', 2, 'Gól alebo asistencia'),
  p('player_yellow', 3, 'Dostane žltú kartu'),
  p('player_top_bonus', 4, 'Najviac bonusových bodov v klube'),
  p('player_full90', 1, 'Odohrá celých 90 minút'),
  p('player_super_sub', 3, 'Príde z lavičky a zahrá si', true),
  p('player_top_tackles', 3, 'Najviac tacklov v klube', true),
  p('player_top_xg', 3, 'Najvyššie xG v klube', true),
  t('team_goals_exact', 'number', 2, 'Presný počet strelených gólov'),
  t('team_conceded_exact', 'number', 2, 'Presný počet inkasovaných gólov'),
  t('team_clean_sheet', 'claim', 2, 'Udržíme čisté konto'),
  t('team_yellows_exact', 'number', 2, 'Presný počet žltých kariet'),
  t('team_red', 'claim', 3, 'Dostaneme červenú kartu'),
  t('team_sub_goal', 'claim', 4, 'Gól dá striedajúci hráč', true),
  t('team_scorers_count', 'number', 3, 'Počet rôznych strelcov'),
  t('team_xg_over', 'claim', 2, 'xG tímu bude nad 1,5', true),
  t('team_saves_over', 'claim', 1, 'Brankár bude mať viac ako 3 zákroky'),
  t('match_penalty_fail', 'claim', 4, 'V zápase bude nepremenená alebo chytená penalta'),
  t('match_own_goal', 'claim', 4, 'V zápase padne vlastný gól'),
]

export const CATALOG_BY_KEY: Record<string, TipDef> = Object.fromEntries(CATALOG.map((d) => [d.key, d]))
