import { useState } from 'react'
import { levelFor } from '@shared/level.ts'
import { ChallengeButton, MIN_STAKE, useDuelStanding } from '@/components/Duels'
import { badgeUrl } from '@/lib/clubColors'
import { useDuels, useIqRows, useProfiles, useSession, useTeams } from '@/lib/data'
import { duelRecord, playerIq, type RoundRow, rankRows, totals } from '@/lib/standings'

type Board = 'individual' | 'club' | 'duels'
const BOARDS: { id: Board; label: string }[] = [
  { id: 'individual', label: 'Výsledky' },
  { id: 'club', label: 'Klub' },
  { id: 'duels', label: 'Duely' },
]

export function Standings() {
  const session = useSession()
  const profiles = useProfiles()
  const teams = useTeams()
  const iq = useIqRows()
  const duels = useDuels()
  const [board, setBoard] = useState<Board>('individual')
  const [gw, setGw] = useState<number | null>(null)
  const standing = useDuelStanding(session?.user.id ?? '')

  // Duel results as per-round rows, so the same totals/round filter works for all three boards.
  const duelRows: RoundRow[] = (duels.data ?? []).filter((d) => d.status === 'finished').flatMap((d) => [
    { user_id: d.challenger_id, nickname: '', gameweek_id: d.gameweek_id, points: d.challenger_delta ?? 0 },
    { user_id: d.opponent_id, nickname: '', gameweek_id: d.gameweek_id, points: d.opponent_delta ?? 0 },
  ])
  const rows = board === 'duels' ? duelRows : iq.data?.[board] ?? []
  const players = (profiles.data ?? []).filter((p) => board !== 'club' || p.club_team_id)
  const ranked = rankRows(totals(rows, players, gw))
  const rounds = [...new Set(rows.map((r) => r.gameweek_id))].sort((a, b) => b - a)
  const clubOf = new Map(players.map((p) => [p.id, p.club_team_id]))
  const byId = new Map(players.map((p) => [p.id, p]))
  const level = (u: string) => iq.data && duels.data ? levelFor(playerIq(iq.data.individual, iq.data.club, duels.data, u).peak).level : null

  return (
    <section>
      <h1 className="font-heading mb-3 text-4xl leading-none">Tabuľky</h1>
      <div className="mb-3 grid grid-cols-3 rounded-lg bg-black/20 p-1">
        {BOARDS.map((b) => (
          <button key={b.id} aria-pressed={board === b.id} onClick={() => { setBoard(b.id); setGw(null) }}
            className={`rounded-md py-2 font-semibold ${board === b.id ? 'bg-white text-neutral-900' : ''}`}>
            {b.label}
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
      {board === 'duels' && (
        <p className="mb-3 text-sm opacity-85">Čistý zisk IQ z duelov. Kamoša vyzveš tlačidlom Vyzvať pri jeho mene.</p>
      )}
      {standing && standing.free < MIN_STAKE && (
        <p className="mb-3 rounded-lg bg-black/25 p-3 text-sm">
          Duely máš zamknuté, kým nebudeš mať aspoň {MIN_STAKE} voľného IQ (najnižšia stávka). Teraz máš {Math.max(0, standing.free)}.
          Hráčov s menej ako {MIN_STAKE} IQ tiež nejde vyzvať.
        </p>
      )}

      <ol className="overflow-hidden rounded-xl bg-white text-neutral-900 shadow-md">
        {ranked.map((r) => {
          const team = teams.data?.byId.get(clubOf.get(r.user_id) ?? -1)
          const me = r.user_id === session?.user.id
          const lv = level(r.user_id)
          const rec = board === 'duels' && duels.data ? duelRecord(duels.data, r.user_id) : null
          return (
            <li key={r.user_id}
              className={`flex items-center gap-3 border-b border-neutral-100 px-4 py-3 last:border-0 ${me ? 'bg-neutral-100 font-semibold' : ''}`}>
              <span className="scoreboard w-7 text-xl text-neutral-500">{r.rank}.</span>
              {board === 'club' && team && <img src={badgeUrl(team.code)} alt={team.name} className="size-7" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate">{r.nickname}</span>
                {rec && <span className="block text-xs font-normal text-neutral-500">{rec.won} V · {rec.drawn} R · {rec.lost} P</span>}
              </span>
              {lv != null && <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">Lv {lv}</span>}
              {!me && session && byId.get(r.user_id) && <ChallengeButton opponent={byId.get(r.user_id)!} userId={session.user.id} />}
              <span className="scoreboard w-10 text-right text-2xl">{board === 'duels' && r.points > 0 ? `+${r.points}` : r.points}</span>
            </li>
          )
        })}
        {ranked.length === 0 && <li className="px-4 py-6 text-center text-neutral-500">Zatiaľ tu nikto nie je.</li>}
      </ol>
    </section>
  )
}
