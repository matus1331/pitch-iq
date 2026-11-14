import { useState } from 'react'
import { badgeUrl } from '@/lib/clubColors'
import { useIqRows, useProfiles, useSession, useTeams } from '@/lib/data'
import { levelFor } from '@/lib/level'
import { iqSummary, rankRows, totals } from '@/lib/standings'

type Board = 'individual' | 'club'

export function Standings() {
  const session = useSession()
  const profiles = useProfiles()
  const teams = useTeams()
  const [board, setBoard] = useState<Board>('individual')
  const [gw, setGw] = useState<number | null>(null)

  const iq = useIqRows()
  const rows = { data: iq.data?.[board] }

  const players = (profiles.data ?? []).filter((p) => board === 'individual' || p.club_team_id)
  const ranked = rankRows(totals(rows.data ?? [], players, gw))
  const rounds = [...new Set((rows.data ?? []).map((r) => r.gameweek_id))].sort((a, b) => b - a)
  const clubOf = new Map(players.map((p) => [p.id, p.club_team_id]))

  return (
    <section>
      <h1 className="font-heading mb-3 text-4xl leading-none">Tabuľky</h1>
      <div className="mb-3 grid grid-cols-2 rounded-lg bg-black/20 p-1">
        {(['individual', 'club'] as const).map((b) => (
          <button key={b} aria-pressed={board === b} onClick={() => setBoard(b)}
            className={`rounded-md py-2 font-semibold ${board === b ? 'bg-white text-neutral-900' : ''}`}>
            {b === 'individual' ? 'Tipovanie výsledkov' : 'Klubová súťaž'}
          </button>
        ))}
      </div>
      <label className="mb-4 flex items-center gap-2 text-sm">
        Zobraziť
        <select value={gw ?? ''} onChange={(e) => setGw(e.target.value ? Number(e.target.value) : null)}
          className="rounded-md bg-white px-2 py-1 text-neutral-900">
          <option value="">celú sezónu</option>
          {rounds.map((r) => <option key={r} value={r}>{r}. kolo</option>)}
        </select>
      </label>

      <ol className="overflow-hidden rounded-xl bg-white text-neutral-900 shadow-md">
        {ranked.map((r) => {
          const team = teams.data?.byId.get(clubOf.get(r.user_id) ?? -1)
          const me = r.user_id === session?.user.id
          return (
            <li key={r.user_id}
              className={`flex items-center gap-3 border-b border-neutral-100 px-4 py-3 last:border-0 ${me ? 'bg-[var(--club-secondary)]/15 font-semibold' : ''}`}>
              <span className="scoreboard w-7 text-xl text-neutral-500">{r.rank}.</span>
              {board === 'club' && team && <img src={badgeUrl(team.code)} alt={team.name} className="size-7" />}
              <span className="min-w-0 flex-1 truncate">{r.nickname}</span>
              {iq.data && (
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                  Lv {levelFor(iqSummary(iq.data.individual, iq.data.club, r.user_id).total).level}
                </span>
              )}
              <span className="scoreboard text-2xl">{r.points}</span>
            </li>
          )
        })}
        {ranked.length === 0 && <li className="px-4 py-6 text-center text-neutral-500">Zatiaľ tu nikto nie je.</li>}
      </ol>
    </section>
  )
}
