import { ChallengeButton, DuelPanel, MATCH_DUELS_PER_ROUND, MIN_DUEL_R, useDuelRound, useDuelStanding } from '@/components/Duels'
import { CardsSkeleton } from '@/components/Skeleton'
import { useProfiles, useSession } from '@/lib/data'
import { duelRecord, rankRows } from '@/lib/standings'

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
        Vyzvi kamoša o 5, 10 alebo 20 Rešpektu (R): na celé kolo (kto naberie viac IQ za tipy zápasov) alebo na jeden zápas.
        Duely sa hrajú len o Rešpekt, tvoje IQ a level nemenia.
      </p>
      {!s || !profiles.data || !session ? <CardsSkeleton /> : (
        <>
          <DuelPanel userId={userId} />

          <RespectCard s={s} userId={userId} round={round.data ?? null} />

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
  const ranked = rankRows(players.map((p) => ({ user_id: p.id, nickname: p.nickname, points: s.respect(p.id).total })))
  return (
    <ol className="overflow-hidden rounded-xl bg-white text-neutral-900 shadow-md">
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
            <span className="w-14 text-right"><span className="scoreboard text-2xl">{r.points}</span> <span className="text-xs text-neutral-500">R</span></span>
          </li>
        )
      })}
    </ol>
  )
}

function RespectCard({ s, userId, round }: { s: NonNullable<ReturnType<typeof useDuelStanding>>; userId: string; round: number | null }) {
  const r = s.respect(userId)
  return (
    <div className="mb-4 rounded-xl bg-white p-4 text-neutral-900 shadow-md">
      <h2 className="font-semibold">Tvoj Rešpekt</h2>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
        <div><dt className="text-xs text-neutral-500">Spolu</dt><dd className="scoreboard text-2xl">{r.total}</dd></div>
        <div><dt className="text-xs text-neutral-500">V dueloch</dt><dd className="scoreboard text-2xl">{r.locked}</dd></div>
        <div><dt className="text-xs text-neutral-500">Voľné</dt>
          <dd className={`scoreboard text-2xl ${r.free >= MIN_DUEL_R ? 'text-green-800' : 'text-red-700'}`}>{Math.max(0, r.free)}</dd></div>
      </dl>
      {round != null && (
        <p className="mt-2 text-sm">Zápasové duely v {round}. kole: {s.matchDuels(userId, round)} z {MATCH_DUELS_PER_ROUND}</p>
      )}
      <p className="mt-2 text-xs leading-relaxed text-neutral-500">
        Každý začína so 100 R a za každé kolo, v ktorom natipuješ všetky zápasy, dostaneš +5 R. Duel začneš, keď ty aj súper
        máte aspoň {MIN_DUEL_R} voľného R. Stávky prijatých duelov a tvojich odoslaných výziev sú v dueloch, kým sa duel nevyhodnotí.
        V kole môžeš mať 2 duely o celé kolo (s jedným hráčom jeden) a {MATCH_DUELS_PER_ROUND} zápasové duely.
      </p>
    </div>
  )
}
