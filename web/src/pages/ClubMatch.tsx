import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { CardsSkeleton } from '@/components/Skeleton'
import { CATALOG_BY_KEY } from '@shared/catalog.ts'
import { carryOver, type Slot, SLOTS } from '@shared/lineup.ts'
import { type ClubTip, ClubTipField } from '@/components/ClubTipField'
import { ClubTipsStep } from '@/components/ClubTipsStep'
import { type LineupPlayer, LineupStep, type Pick } from '@/components/LineupStep'
import { Button } from '@/components/ui/button'
import { availability } from '@/lib/availability'
import { type BreakdownRow, formatBreakdown } from '@/lib/breakdown'
import { badgeUrl } from '@/lib/clubColors'
import { type Fixture, type Profile, useTeams } from '@/lib/data'
import { errorText, must, supabase } from '@/lib/supabase'
import { tipState } from '@/lib/tipState'
import { useRoundGws } from './Round'

interface Offer { fixture_id: number; team_id: number; tip_keys: string[]; voided: boolean }
interface LineupRow extends Pick { fixture_id: number; points: number | null; fixtures: { kickoff_time: string | null } | null }
interface MatchStats { player_id: number; fixture_id: number; stats: { total_points?: number; breakdown?: BreakdownRow[] } }

const kickoffFmt = new Intl.DateTimeFormat('sk-SK', { weekday: 'long', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })
const sum = (rows: { points: number | null }[]) => rows.reduce((s, r) => s + (r.points ?? 0), 0)

export function ClubMatch({ profile }: { profile: Profile }) {
  const qc = useQueryClient()
  const teams = useTeams()
  const gws = useRoundGws()
  const club = profile.club_team_id!
  const [error, setError] = useState<string | null>(null)

  const data = useQuery({
    queryKey: ['club', club, gws],
    enabled: gws.length > 0,
    queryFn: async () => {
      const fixtures = must(await supabase.from('fixtures').select('*').in('gameweek_id', gws)
        .or(`team_h.eq.${club},team_a.eq.${club}`).order('kickoff_time')) as Fixture[]
      const ids = fixtures.map((f) => f.id)
      const [offers, tips, players, lineups, stats] = await Promise.all([
        supabase.from('club_tip_offers').select('*').eq('team_id', club).in('fixture_id', ids),
        supabase.from('club_tips').select('*').eq('user_id', profile.id).in('fixture_id', ids),
        supabase.from('players')
          .select('id, web_name, position, status, chance_next, news, start_pct, total_points, form, minutes, goals_scored, assists')
          .eq('team_id', club).order('web_name'),
        // All own lineups of the season (5 rows a match), so a new match can start from the last one.
        supabase.from('club_lineups').select('fixture_id, slot, player_id, points, fixtures(kickoff_time)').eq('user_id', profile.id),
        supabase.from('player_match_stats').select('player_id, fixture_id, stats').eq('team_id', club).in('fixture_id', ids),
      ])
      return {
        fixtures,
        offers: must(offers) as Offer[],
        tips: must(tips) as ClubTip[],
        players: must(players) as LineupPlayer[],
        lineups: must(lineups) as unknown as LineupRow[],
        stats: must(stats) as MatchStats[],
      }
    },
  })

  const refresh = () => qc.invalidateQueries({ queryKey: ['club', club] })
  async function run(p: PromiseLike<{ error: unknown }>, done: string) {
    setError(null)
    const { error } = await p
    if (error) setError(errorText(error))
    else toast.success(done)
    await refresh()
  }

  if (!teams.data || !data.data) return <CardsSkeleton />
  const { fixtures, offers, tips, players, lineups, stats } = data.data
  const upcoming = fixtures.filter((f) => !f.started)
  const played = fixtures.filter((f) => f.started)
  const info = new Map(players.map((p) => [p.id, { team_id: club, position: p.position, status: p.status }]))

  /** The lineup of the latest other match before this one, without players who cannot play now. */
  function suggestion(f: Fixture): Pick[] | null {
    if (!f.kickoff_time) return null
    const earlier = lineups.filter((l) => l.fixture_id !== f.id && l.fixtures?.kickoff_time && l.fixtures.kickoff_time < f.kickoff_time!)
    const last = earlier.reduce<LineupRow | null>((a, l) => (!a || l.fixtures!.kickoff_time! > a.fixtures!.kickoff_time! ? l : a), null)
    if (!last) return null
    return carryOver(earlier.filter((l) => l.fixture_id === last.fixture_id).map(({ slot, player_id }) => ({ slot, player_id })), info, club)
  }

  return (
    <section className="space-y-8">
      <div>
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-heading text-4xl leading-none">Môj klub</h1>
          <Link to="/klub/kader" className="underline">Káder</Link>
        </div>
        <p>Pred každým zápasom postav zostavu piatich hráčov, zbierajú IQ podľa FPL bodov. K tomu si môžeš vybrať až 3 tipy.</p>
      </div>
      {error && <p role="alert" className="rounded-lg bg-white p-3 text-red-700">{error}</p>}
      {fixtures.length === 0 && <p>Tvoj klub v tomto ani nasledujúcom kole nehrá.</p>}

      {[...upcoming, ...played].map((f, i) => {
        const home = f.team_h === club
        const opp = teams.data.byId.get(home ? f.team_a : f.team_h)!
        const offer = offers.find((o) => o.fixture_id === f.id)
        const mine = tips.filter((t) => t.fixture_id === f.id)
        const lineup = lineups.filter((l) => l.fixture_id === f.id)
        const state = tipState(f)
        const key = { user_id: profile.id, fixture_id: f.id }
        return (
          <div key={f.id}>
            {i === 0 && upcoming.length > 0 && <h2 className="font-heading mb-3 text-3xl leading-none">{upcoming.length > 1 ? 'Nadchádzajúce zápasy' : 'Nadchádzajúci zápas'}</h2>}
            {i === upcoming.length && <h2 className="font-heading mb-3 text-3xl leading-none">Odohrané</h2>}
            <div className="mb-3 flex items-center gap-3">
              <img src={badgeUrl(opp.code)} alt="" className="size-10 rounded-full bg-white p-1" />
              <div>
                <h2 className="font-heading text-2xl leading-tight">{home ? 'Doma' : 'Vonku'} proti {opp.name}</h2>
                <p className="text-sm">
                  {f.kickoff_time ? kickoffFmt.format(new Date(f.kickoff_time)) : 'Termín zatiaľ nie je známy'}
                  {state === 'scored' && ` · ${f.team_h_score}:${f.team_a_score} · Zostava ${sum(lineup)} · Tipy ${sum(mine)}`}
                </p>
              </div>
            </div>
            {offer?.voided || state === 'postponed' ? (
              <p className="rounded-xl bg-white p-4 text-neutral-900">Zápas bol odložený, zostava a klubové tipy sú zrušené.</p>
            ) : state === 'open' ? (
              <OpenMatch
                lineup={lineup} suggestion={suggestion(f)} players={players} offer={offer} mine={mine} version={data.dataUpdatedAt}
                onPick={(slot, playerId) => {
                  const other = lineup.find((l) => l.player_id === playerId && l.slot !== slot)
                  return run((async () => {
                    if (playerId == null) return supabase.from('club_lineups').delete().match({ ...key, slot })
                    // A player can be in one slot only, so moving him frees his old one first.
                    if (other) {
                      const r = await supabase.from('club_lineups').delete().match({ ...key, slot: other.slot })
                      if (r.error) return r
                    }
                    return supabase.from('club_lineups').upsert({ ...key, slot, player_id: playerId })
                  })(), playerId == null ? 'Hráč odobratý zo zostavy' : 'Hráč pridaný do zostavy')
                }}
                onSaveAll={(picks) => run(supabase.from('club_lineups').upsert(picks.map((p) => ({ ...key, ...p }))), 'Zostava uložená')}
                onSaveTip={(tip_key, v) => run(supabase.from('club_tips').upsert({ ...key, tip_key, ...v }), 'Klubový tip uložený')}
                onRemoveTip={(tip_key) => run(supabase.from('club_tips').delete().match({ ...key, tip_key }), 'Klubový tip zrušený')}
              />
            ) : (
              <div className="space-y-3">
                <LineupResults lineup={lineup} players={players} stats={stats.filter((s) => s.fixture_id === f.id)} />
                <ul className="space-y-3">
                  {mine.map((t) => (
                    <ClubTipField key={t.tip_key} def={CATALOG_BY_KEY[t.tip_key]} tip={t} players={players}
                      editable={false} full onSave={async () => {}} onRemove={async () => {}} />
                  ))}
                  {mine.length === 0 && <li className="rounded-xl bg-white p-4 text-neutral-900">Na tento zápas si klubové tipy nedal.</li>}
                </ul>
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}

type Step = 1 | 2 | 3
const STEPS: { step: Step; label: string }[] = [{ step: 1, label: '① Zostava' }, { step: 2, label: '② Tipy' }, { step: 3, label: '③ Zhrnutie' }]

/** A match before kickoff: lineup, tips, summary. A match that already has a lineup opens on the summary. */
function OpenMatch({ lineup, suggestion, players, offer, mine, version, onPick, onSaveAll, onSaveTip, onRemoveTip }: {
  lineup: LineupRow[]
  suggestion: Pick[] | null
  players: LineupPlayer[]
  offer: Offer | undefined
  mine: ClubTip[]
  version: number
  onPick: (slot: Slot, playerId: number | null) => Promise<void>
  onSaveAll: (picks: Pick[]) => Promise<void>
  onSaveTip: (key: string, v: { player_id: number | null; value: number | null }) => Promise<void>
  onRemoveTip: (key: string) => Promise<void>
}) {
  const started = lineup.length > 0 || mine.length > 0 // tips placed before the lineup step existed still count
  const [step, setStep] = useState<Step>(started ? 3 : 1)
  const byId = new Map(players.map((p) => [p.id, p]))
  return (
    <div className="space-y-3">
      <nav aria-label="Kroky" className="grid grid-cols-3 gap-2">
        {STEPS.map((s) => (
          <button key={s.step} type="button" aria-current={step === s.step ? 'step' : undefined}
            disabled={s.step > 1 && !started} onClick={() => setStep(s.step)}
            className={`rounded-lg px-2 py-2 font-semibold disabled:opacity-50 ${step === s.step ? 'bg-white text-neutral-900' : 'bg-black/25'}`}>
            {s.label}
          </button>
        ))}
      </nav>

      {step === 1 && (
        <LineupStep saved={lineup} suggestion={suggestion} players={players}
          onPick={onPick} onSaveAll={onSaveAll} onNext={() => setStep(2)} canContinue={started} />
      )}

      {step === 2 && (offer ? (
        <ClubTipsStep tipKeys={offer.tip_keys} mine={mine} players={players} version={version}
          onSave={onSaveTip} onRemove={onRemoveTip} onNext={() => setStep(3)} />
      ) : (
        <div className="space-y-3">
          <p className="rounded-xl bg-white p-4 text-neutral-900">Tipy sa ešte pripravujú. Skús to o pár minút.</p>
          <Button className="w-full" variant="outline" onClick={() => setStep(3)}>Preskočiť</Button>
        </div>
      ))}

      {step === 3 && (
        <div className="space-y-3">
          <div className="rounded-xl bg-white p-4 text-neutral-900 shadow-md">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-heading text-2xl">Zostava</h3>
              <Button size="sm" variant="outline" onClick={() => setStep(1)}>Upraviť</Button>
            </div>
            <ul className="space-y-1">
              {SLOTS.map((s) => {
                const p = byId.get(lineup.find((l) => l.slot === s.slot)?.player_id ?? -1)
                const a = p && availability(p)
                return (
                  <li key={s.slot} className="flex justify-between gap-3">
                    <span className="text-neutral-500">{s.label}</span>
                    <span className={a?.icon || p?.status === 'd' ? 'text-red-700' : ''}>
                      {p ? `${a?.icon ?? (p.status === 'd' ? '⚠️' : '')} ${p.web_name}`.trim() : 'prázdne, 0 IQ'}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
          <div className="flex items-center justify-between">
            <h3 className="font-heading text-2xl">Tipy {mine.length}/3</h3>
            <Button size="sm" variant="outline" onClick={() => setStep(2)}>Upraviť</Button>
          </div>
          <ul className="space-y-3">
            {mine.map((t) => (
              <ClubTipField key={`${t.tip_key}-${version}`} def={CATALOG_BY_KEY[t.tip_key]} tip={t} players={players}
                editable={false} full onSave={async () => {}} onRemove={async () => {}} />
            ))}
            {mine.length === 0 && <li className="rounded-xl bg-white p-4 text-neutral-900">Bez tipov. Zbierať budeš len za zostavu.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}

/** After kickoff: each lineup player with his FPL points and what they were for. */
function LineupResults({ lineup, players, stats }: { lineup: LineupRow[]; players: LineupPlayer[]; stats: MatchStats[] }) {
  const byId = new Map(players.map((p) => [p.id, p]))
  return (
    <div className="rounded-xl bg-white p-4 text-neutral-900 shadow-md">
      <h3 className="font-heading text-2xl">Zostava</h3>
      {lineup.length === 0 ? <p>Na tento zápas si zostavu nemal.</p> : (
        <ul className="divide-y divide-neutral-200">
          {SLOTS.map((s) => {
            const row = lineup.find((l) => l.slot === s.slot)
            if (!row) return null
            const p = byId.get(row.player_id)
            const rows = stats.find((x) => x.player_id === row.player_id)?.stats.breakdown ?? []
            const text = formatBreakdown(rows)
            return (
              <li key={s.slot} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="font-semibold">{p && availability(p).icon} {p?.web_name ?? 'Hráč už nie je v klube'}</p>
                  <p className="text-sm text-neutral-500">{s.label}{text && ` · ${text}`}</p>
                </div>
                <span className="scoreboard shrink-0 text-2xl">{row.points ?? '–'}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
