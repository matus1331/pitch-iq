import { useState } from 'react'
import { levelFor } from '@shared/level.ts'
import { CardsSkeleton } from '@/components/Skeleton'
import { badgeUrl } from '@/lib/clubColors'
import { useDuels, useIqRows, useProfiles, useSession, useTeams } from '@/lib/data'
import { playerIq, rankRows, totals } from '@/lib/standings'

type Board = 'individual' | 'club'
const BOARDS: { id: Board; label: string; about: string }[] = [
  { id: 'individual', label: 'Zápasy', about: 'IQ za tipy na výsledky zápasov.' },
  { id: 'club', label: 'Klub', about: 'IQ za tipy na zápasy vlastného klubu.' },
]

export function Standings() {
  const session = useSession()
  const profiles = useProfiles()
  const teams = useTeams()
  const iq = useIqRows()
  const duels = useDuels()
  const [board, setBoard] = useState<Board>('individual')
  const [gw, setGw] = useState<number | null>(null)
  const rows = iq.data?.[board] ?? []
  const players = (profiles.data ?? []).filter((p) => board !== 'club' || p.club_team_id)
  const ranked = rankRows(totals(rows, players, gw))
  const nobody = ranked.every((r) => r.points === 0)
  const rounds = [...new Set(rows.map((r) => r.gameweek_id))].sort((a, b) => b - a)
  const clubOf = new Map(players.map((p) => [p.id, p.club_team_id]))
  const level = (u: string) => iq.data && duels.data ? levelFor(playerIq(iq.data.individual, iq.data.club, duels.data, u).peak).level : null

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
      <ol key={`${board}-${gw}`} className="swap-in overflow-hidden rounded-xl bg-white text-neutral-900 shadow-md">
        {ranked.map((r) => {
          const team = teams.data?.byId.get(clubOf.get(r.user_id) ?? -1)
          const me = r.user_id === session?.user.id
          const lv = level(r.user_id)
          return (
            <li key={r.user_id}
              className={`flex items-center gap-3 border-b border-neutral-100 px-4 py-3 last:border-0 ${me ? 'bg-neutral-100 font-semibold' : ''}`}>
              <span className="scoreboard w-7 text-xl text-neutral-500">{nobody ? '–' : `${r.rank}.`}</span>
              {board === 'club' && team && <img src={badgeUrl(team.code)} alt={team.name} className="size-7" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate">{r.nickname}{me && ' (ty)'}</span>
              </span>
              {lv != null && <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">Lv {lv}</span>}
              <span className="scoreboard w-10 text-right text-2xl">{r.points}</span>
            </li>
          )
        })}
        {ranked.length === 0 && <li className="px-4 py-6 text-center text-neutral-500">Zatiaľ tu nikto nie je.</li>}
      </ol>
      </>)}
    </section>
  )
}
