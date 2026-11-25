import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { MatchTip } from '@/components/MatchTipCard'
import { RoundMatches } from '@/components/RoundMatches'
import { CardsSkeleton } from '@/components/Skeleton'
import { TipLegend, TipTable } from '@/components/TipTable'
import { type ClTeam, useClFixtures, useClTeams, useClTips } from '@/lib/cl'
import { clDefaultRound, clRoundName, FIRST_KNOCKOUT_ROUND } from '@/lib/clRounds'
import { type Fixture, type Profile, useProfiles, useSession } from '@/lib/data'
import { rankRows, tipStats, totals } from '@/lib/standings'
import { supabase } from '@/lib/supabase'

const TABS = [{ id: 'matches', label: 'Zápasy' }, { id: 'table', label: 'Tabuľka' }] as const

export function ChampionsLeague() {
  const session = useSession()
  const queries = [useClTeams(), useClFixtures(), useClTips(), useProfiles()] as const
  const [teams, fixtures, tips, profiles] = queries
  const [tab, setTab] = useState<'matches' | 'table'>('matches')

  return (
    <section>
      <h1 className="font-heading mb-3 text-4xl leading-none">Liga majstrov</h1>
      <div className="relative mb-3 grid grid-cols-2 rounded-lg bg-black/20 p-1">
        {/* The white pill slides under the chosen tab. */}
        <span aria-hidden className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/2)] rounded-md bg-white transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{ transform: `translateX(${TABS.findIndex((t) => t.id === tab) * 100}%)` }} />
        {TABS.map((t) => (
          <button key={t.id} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}
            className={`relative rounded-md py-2 font-semibold transition-colors duration-300 ${tab === t.id ? 'text-neutral-900' : ''}`}>
            {t.label}
          </button>
        ))}
      </div>
      {!session || !teams.data || !fixtures.data || !tips.data || !profiles.data
        ? (queries.some((q) => q.isError)
          ? <p className="rounded-xl bg-black/25 p-3">Dáta sa nepodarilo načítať. Skús to znova o chvíľu.</p>
          : <CardsSkeleton />)
        : fixtures.data.length === 0 ? <p>Zápasy Ligy majstrov zatiaľ nie sú k dispozícii.</p>
          : tab === 'matches'
            ? <Matches userId={session.user.id} teams={teams.data} fixtures={fixtures.data} tips={tips.data} profiles={profiles.data} />
            : <Table userId={session.user.id} fixtures={fixtures.data} tips={tips.data} profiles={profiles.data} />}
      <p className="mt-6 text-center text-xs opacity-80">Dáta: football-data.org</p>
    </section>
  )
}

function RoundSelect({ label, value, rounds, all, onChange }: {
  label: string
  value: number | null
  rounds: number[]
  /** Text of the choice for every round; without it one round is always chosen. */
  all?: string
  onChange: (round: number | null) => void
}) {
  return (
    <label className="flex items-center gap-2">
      {label}
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className="rounded-md bg-white px-2 py-1 text-neutral-900">
        {all && <option value="">{all}</option>}
        {rounds.map((r) => <option key={r} value={r}>{clRoundName(r)}</option>)}
      </select>
    </label>
  )
}

function Matches({ userId, teams, fixtures, tips, profiles }: {
  userId: string
  teams: Map<number, ClTeam>
  fixtures: Fixture[]
  tips: MatchTip[]
  profiles: Profile[]
}) {
  const qc = useQueryClient()
  const [opened] = useState(() => Date.now())
  const [picked, setPicked] = useState<number | null>(null)
  const gw = picked ?? clDefaultRound(fixtures, opened)!
  const round = fixtures.filter((f) => f.gameweek_id === gw)
  const ids = new Set(round.map((f) => f.id))
  const total = tips.filter((t) => t.user_id === userId && ids.has(t.fixture_id)).reduce((s, t) => s + (t.points ?? 0), 0)
  const rounds = [...new Set(fixtures.map((f) => f.gameweek_id!))].sort((a, b) => a - b)
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p>Tvoje IQ v tomto kole: <b>{total}</b></p>
        <RoundSelect label="Kolo" value={gw} rounds={rounds} onChange={setPicked} />
      </div>
      {gw >= FIRST_KNOCKOUT_ROUND && <p className="mb-3 text-sm">Platí skóre po 90 minútach, bez predĺženia a penált.</p>}
      <RoundMatches
        exactOnly
        round={round.filter((f) => f.kickoff_time)}
        postponed={round.filter((f) => !f.kickoff_time)}
        tips={tips}
        teamOf={(id) => {
          const t = teams.get(id)
          return { name: t?.short_name ?? '?', short_name: t?.short_name ?? '?', badge: t?.crest ?? null }
        }}
        profiles={new Map(profiles.map((p) => [p.id, p]))}
        userId={userId}
        save={(fixture_id, { home_goals, away_goals }) =>
          supabase.from('cl_match_tips').upsert({ user_id: userId, fixture_id, home_goals, away_goals })}
        onSaved={() => qc.invalidateQueries({ queryKey: ['cl', 'tips'] })}
      />
    </>
  )
}

function Table({ userId, fixtures, tips, profiles }: { userId: string; fixtures: Fixture[]; tips: MatchTip[]; profiles: Profile[] }) {
  const [gw, setGw] = useState<number | null>(null)
  const byId = new Map(fixtures.map((f) => [f.id, f]))
  const scored = tips.flatMap((t) => {
    const f = byId.get(t.fixture_id)
    return t.points == null || !f ? [] : [{
      ...t, points: t.points, nickname: '', gameweek_id: f.gameweek_id!, team_h_score: f.team_h_score, team_a_score: f.team_a_score,
    }]
  })
  const stats = tipStats(scored, gw)
  const ranked = rankRows(totals(scored, profiles, gw).map((r) => ({ ...r, exact: stats.get(r.user_id)?.exact, avgError: stats.get(r.user_id)?.avgError })))
  const nobody = ranked.every((r) => r.points === 0)
  const rounds = [...new Set(scored.map((r) => r.gameweek_id))].sort((a, b) => b - a)
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm">
        <p>IQ za tipy v Lige majstrov.</p>
        <RoundSelect label="Zobraziť" value={gw} rounds={rounds} all="celú sezónu" onChange={setGw} />
      </div>
      {nobody && ranked.length > 0 && (
        <p className="swap-in mb-3 rounded-xl bg-black/25 p-3 text-sm">
          {gw ? 'V tomto kole zatiaľ nikto nezískal IQ.' : 'Zatiaľ nikto nemá IQ. Tabuľka sa naplní po prvých odohraných zápasoch.'}
        </p>
      )}
      <TipTable rows={ranked} me={userId} nobody={nobody} swapKey={`cl-${gw}`} stats={stats} />
      <TipLegend />
    </>
  )
}
