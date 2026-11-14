import { useState } from 'react'
import { levelFor } from '@shared/level.ts'
import { ChallengeButton, MIN_STAKE, useDuelRound, useDuelStanding } from '@/components/Duels'
import { badgeUrl } from '@/lib/clubColors'
import { useDuels, useIqRows, useProfiles, useSession, useTeams } from '@/lib/data'
import { DUEL_CATEGORIES, duelRecord, playerIq, type RoundRow, rankRows, totals } from '@/lib/standings'

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

  const round = useDuelRound()
  // The Duely board ranks players by their whole IQ: tips in both categories plus duel results.
  const duelRows: RoundRow[] = standing ? (profiles.data ?? []).map((p) =>
    ({ user_id: p.id, nickname: p.nickname, gameweek_id: 0, points: standing.total(p.id) })) : []
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
      {board !== 'duels' && <label className="mb-4 flex items-center gap-2 text-sm">
        Zobraziť
        <select value={gw ?? ''} onChange={(e) => setGw(e.target.value ? Number(e.target.value) : null)}
          className="rounded-md bg-white px-2 py-1 text-neutral-900">
          <option value="">celú sezónu</option>
          {rounds.map((r) => <option key={r} value={r}>{r}. kolo</option>)}
        </select>
      </label>}
      {board === 'duels' && (
        <p className="mb-3 text-sm opacity-85">
          Celkové IQ hráčov. Pri výzve si zvolíš, či hráte o Výsledky, alebo o Klub. Výhra aj prehra sa zapíše do tej kategórie.
        </p>
      )}
      {board === 'duels' && standing && session && (
        <div className="mb-4 rounded-xl bg-white p-4 text-neutral-900 shadow-md">
          <h2 className="font-semibold">Tvoje IQ na duely</h2>
          <table className="mt-2 w-full text-sm">
            <thead className="text-xs text-neutral-500">
              <tr><th className="text-left font-normal">Kategória</th><th className="text-right font-normal">IQ</th>
                <th className="text-right font-normal">V dueloch</th><th className="text-right font-normal">Voľné</th></tr>
            </thead>
            <tbody>
              {DUEL_CATEGORIES.map((c) => {
                const x = standing.cat(session.user.id, c.id)
                return (
                  <tr key={c.id} className="border-t border-neutral-100">
                    <td className="py-1.5">{c.label}</td>
                    <td className="scoreboard text-right">{x.iq}</td>
                    <td className="scoreboard text-right">{x.locked}</td>
                    <td className={`scoreboard text-right ${x.free >= MIN_STAKE ? 'text-green-800' : 'text-red-700'}`}>{Math.max(0, x.free)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs leading-relaxed text-neutral-500">
            Stávky prijatých duelov a tvojich odoslaných výziev sú v dueloch, kým sa duel nevyhodnotí. Duel v kategórii začneš,
            keď v nej ty aj súper máte aspoň {MIN_STAKE} voľného IQ. S jedným hráčom môžeš mať v kole len jeden duel.
          </p>
        </div>
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
              {board === 'duels' && !me && session && byId.get(r.user_id) && <ChallengeButton opponent={byId.get(r.user_id)!} userId={session.user.id} round={round.data ?? null} />}
              <span className="scoreboard w-10 text-right text-2xl">{r.points}</span>
            </li>
          )
        })}
        {ranked.length === 0 && <li className="px-4 py-6 text-center text-neutral-500">Zatiaľ tu nikto nie je.</li>}
      </ol>
    </section>
  )
}
