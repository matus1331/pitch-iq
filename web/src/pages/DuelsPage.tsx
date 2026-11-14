import { ChallengeButton, DuelPanel, MIN_STAKE, useDuelRound, useDuelStanding } from '@/components/Duels'
import { CardsSkeleton } from '@/components/Skeleton'
import { useProfiles, useSession } from '@/lib/data'
import { DUEL_CATEGORIES, duelRecord, rankRows } from '@/lib/standings'

/** Duely tab: my duels, the IQ I can bet, and everyone I can challenge. */
export function DuelsPage() {
  const session = useSession()
  const profiles = useProfiles()
  const round = useDuelRound()
  const userId = session?.user.id ?? ''
  const s = useDuelStanding(userId)

  return (
    <section>
      <h1 className="font-heading mb-1 text-4xl leading-none">Duely</h1>
      <p className="mb-4">
        Vyzvi kamoša o 5, 10 alebo 20 IQ. Hráte o Zápasy alebo o Klub: kto v kole naberie v tej kategórii viac IQ, berie stávku.
      </p>
      {!s || !profiles.data || !session ? <CardsSkeleton /> : (
        <>
          <DuelPanel userId={userId} />

          <div className="mb-4 rounded-xl bg-white p-4 text-neutral-900 shadow-md">
            <h2 className="font-semibold">Tvoje IQ na duely</h2>
            <table className="mt-2 w-full text-sm">
              <thead className="text-xs text-neutral-500">
                <tr><th className="text-left font-normal">Kategória</th><th className="text-right font-normal">IQ</th>
                  <th className="text-right font-normal">V dueloch</th><th className="text-right font-normal">Voľné</th></tr>
              </thead>
              <tbody>
                {DUEL_CATEGORIES.map((c) => {
                  const x = s.cat(userId, c.id)
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

          <h2 className="font-heading mb-2 text-2xl">Hráči</h2>
          <PlayerList s={s} userId={userId} round={round.data ?? null} players={profiles.data} />
        </>
      )}
    </section>
  )
}

function PlayerList({ s, userId, round, players }: {
  s: NonNullable<ReturnType<typeof useDuelStanding>>; userId: string; round: number | null
  players: { id: string; nickname: string; club_team_id: number | null }[]
}) {
  const ranked = rankRows(players.map((p) => ({ user_id: p.id, nickname: p.nickname, points: s.total(p.id) })))
  const nobody = ranked.every((r) => r.points === 0)
  return (
    <ol className="overflow-hidden rounded-xl bg-white text-neutral-900 shadow-md">
      {nobody && <li className="border-b border-neutral-100 px-4 py-3 text-sm text-neutral-600">Zatiaľ nikto nemá IQ. Duely sa odomknú po prvých bodoch.</li>}
      {ranked.map((r) => {
        const me = r.user_id === userId
        const rec = duelRecord(s.duels, r.user_id)
        const p = players.find((x) => x.id === r.user_id)!
        return (
          <li key={r.user_id} className={`flex items-center gap-3 border-b border-neutral-100 px-4 py-3 last:border-0 ${me ? 'bg-neutral-100 font-semibold' : ''}`}>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{r.nickname}{me && ' (ty)'}</span>
              <span className="block text-xs font-normal text-neutral-500">
                Lv {s.levelOf(r.user_id)} · duely {rec.won} V · {rec.drawn} R · {rec.lost} P
              </span>
            </span>
            {!me && <ChallengeButton opponent={p} userId={userId} round={round} />}
            <span className="w-12 text-right"><span className="scoreboard text-2xl">{r.points}</span> <span className="text-xs text-neutral-500">IQ</span></span>
          </li>
        )
      })}
    </ol>
  )
}
