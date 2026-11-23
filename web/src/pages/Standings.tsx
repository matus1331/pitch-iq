import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CardsSkeleton } from '@/components/Skeleton'
import { badgeUrl } from '@/lib/clubColors'
import { useIqRows, useProfiles, useSession, useTeams, useTipResults } from '@/lib/data'
import { rankRows, type TipStats, tipStats, totals } from '@/lib/standings'

type Board = 'individual' | 'club'
const BOARDS: { id: Board; label: string; about: string }[] = [
  { id: 'individual', label: 'Zápasy', about: 'IQ za tipy na výsledky zápasov.' },
  { id: 'club', label: 'Klub', about: 'IQ za zostavu a tipy na zápasy vlastného klubu.' },
]

export function Standings() {
  const session = useSession()
  const profiles = useProfiles()
  const teams = useTeams()
  const iq = useIqRows()
  const tips = useTipResults()
  const [board, setBoard] = useState<Board>('individual')
  const [gw, setGw] = useState<number | null>(null)
  const rows = iq.data?.[board] ?? []
  const players = (profiles.data ?? []).filter((p) => board !== 'club' || p.club_team_id)
  // Hit counts and accuracy exist for match tips only; they also break ties in points.
  const stats = board === 'individual' ? tipStats(tips.data ?? [], gw) : new Map<string, TipStats>()
  const ranked = rankRows(totals(rows, players, gw).map((r) => ({ ...r, exact: stats.get(r.user_id)?.exact, avgError: stats.get(r.user_id)?.avgError })))
  // Club board: the part of each player's points that came from the lineup.
  const lineup = new Map<string, number>()
  if (board === 'club') for (const r of rows) if (gw == null || r.gameweek_id === gw) lineup.set(r.user_id, (lineup.get(r.user_id) ?? 0) + (r.lineup_points ?? 0))
  const nobody = ranked.every((r) => r.points === 0)
  const rounds = [...new Set(rows.map((r) => r.gameweek_id))].sort((a, b) => b - a)
  const clubOf = new Map(players.map((p) => [p.id, p.club_team_id]))

  return (
    <section>
      <h1 className="font-heading mb-3 text-4xl leading-none">Tabuľky</h1>
      <div className="relative mb-3 grid grid-cols-2 rounded-lg bg-black/20 p-1">
        {/* The white pill slides under the chosen board. */}
        <span aria-hidden className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/2)] rounded-md bg-white transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{ transform: `translateX(${BOARDS.findIndex((b) => b.id === board) * 100}%)` }} />
        {BOARDS.map((b) => (
          <button key={b.id} aria-pressed={board === b.id} onClick={() => { setBoard(b.id); setGw(null) }}
            className={`relative rounded-md py-2 font-semibold transition-colors duration-300 ${board === b.id ? 'text-neutral-900' : ''}`}>
            {b.label}
          </button>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm">
        <p>{BOARDS.find((b) => b.id === board)!.about}</p>
        <label className="flex items-center gap-2">
          Zobraziť
          <select value={gw ?? ''} onChange={(e) => setGw(e.target.value ? Number(e.target.value) : null)}
            className="rounded-md bg-white px-2 py-1 text-neutral-900">
            <option value="">celú sezónu</option>
            {rounds.map((r) => <option key={r} value={r}>{r}. kolo</option>)}
          </select>
        </label>
      </div>
      {!iq.data || !profiles.data ? <CardsSkeleton count={1} height="h-48" /> : (<>
      {nobody && ranked.length > 0 && (
        <p className="swap-in mb-3 rounded-xl bg-black/25 p-3 text-sm">
          {gw ? 'V tomto kole zatiaľ nikto nezískal IQ.' : 'Zatiaľ nikto nemá IQ. Tabuľka sa naplní po prvých odohraných zápasoch.'}
        </p>
      )}
      {(() => {
        const withStats = board === 'individual'
        const cols = withStats
          ? 'grid-cols-[1.5rem_minmax(0,1fr)_repeat(4,2rem)_2.5rem]'
          : 'grid-cols-[1.5rem_minmax(0,1fr)_2.5rem]'
        const fmt = (v: number | null | undefined) => v == null ? '–' : v.toFixed(1).replace('.', ',')
        return (
          <div key={`t-${board}-${gw}`} className="swap-in overflow-hidden rounded-xl bg-white text-neutral-900 shadow-md">
            <div className={`grid ${cols} items-center gap-x-1 border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-semibold text-neutral-500`}>
              <span>#</span><span>Hráč</span>
              {withStats && ([['🎯', 'presný výsledok'], ['✓', 'správny víťaz alebo remíza'], ['✗', 'netrafené'], ['Ø', 'priemerná chyba v góloch na tip']] as const).map(([icon, hint]) => (
                <Link key={icon} to="/pravidla#tabulka" title={`${hint} (klikni pre vysvetlenie)`} aria-label={`${hint}, vysvetlenie v pravidlách`}
                  className="text-center underline decoration-dotted underline-offset-4">{icon}</Link>
              ))}
              <span className="text-right">IQ</span>
            </div>
            {ranked.map((r) => {
              const team = teams.data?.byId.get(clubOf.get(r.user_id) ?? -1)
              const me = r.user_id === session?.user.id
              const st = stats.get(r.user_id)
              return (
                <div key={r.user_id} className={`grid ${cols} items-center gap-x-1 border-b border-neutral-100 px-3 py-2.5 text-sm last:border-0 ${me ? 'bg-neutral-100 font-semibold' : ''}`}>
                  <span className="scoreboard text-base text-neutral-500">{nobody ? '–' : r.rank}</span>
                  <span className="flex min-w-0 items-center gap-1.5">
                    {board === 'club' && team && <img src={badgeUrl(team.code)} alt={team.name} className="size-5" />}
                    <span className="truncate">{r.nickname}</span>
                    {board === 'club' && <span className="shrink-0 text-xs font-normal text-neutral-500">z toho zostava {lineup.get(r.user_id) ?? 0}</span>}
                  </span>
                  {withStats && <>
                    <span className="text-center">{st?.exact ?? 0}</span><span className="text-center">{st?.right ?? 0}</span>
                    <span className="text-center">{st?.wrong ?? 0}</span><span className="text-center text-neutral-600">{fmt(st?.avgError)}</span>
                  </>}
                  <span className="scoreboard text-right text-xl">{r.points}</span>
                </div>
              )
            })}
            {ranked.length === 0 && <p className="px-4 py-6 text-center text-neutral-500">Zatiaľ tu nikto nie je.</p>}
          </div>
        )
      })()}
      {board === 'individual' && (
        <p className="mt-2 text-xs">
          🎯 presný výsledok · ✓ správny víťaz alebo remíza · ✗ netrafené · Ø priemerná chyba v góloch na tip.
          Pri rovnosti bodov rozhoduje viac presných výsledkov, potom menšia chyba.{' '}
          <Link to="/pravidla#tabulka" className="font-semibold underline underline-offset-4">Podrobné vysvetlenie</Link>
        </p>
      )}
      </>)}
    </section>
  )
}
