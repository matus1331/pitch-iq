import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { badgeUrl } from '@/lib/clubColors'
import { useProfiles, useSession, useTeams } from '@/lib/data'
import { type RoundRow, rankRows, totals } from '@/lib/standings'
import { must, supabase } from '@/lib/supabase'

type Board = 'individual' | 'club'

export function Standings() {
  const session = useSession()
  const profiles = useProfiles()
  const teams = useTeams()
  const [board, setBoard] = useState<Board>('individual')
  const [gw, setGw] = useState<number | null>(null)

  const rows = useQuery({
    queryKey: ['leaderboard', board],
    queryFn: async () =>
      must(await supabase.from(board === 'individual' ? 'leaderboard_individual' : 'leaderboard_club').select('*')) as RoundRow[],
  })

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
              <span className="flex-1 truncate">{r.nickname}</span>
              <span className="scoreboard text-2xl">{r.points}</span>
            </li>
          )
        })}
        {ranked.length === 0 && <li className="px-4 py-6 text-center text-neutral-500">Zatiaľ tu nikto nie je.</li>}
      </ol>
    </section>
  )
}
