import { BookOpen, LogOut } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PushToggle } from '@/components/PushToggle'
import { CardsSkeleton } from '@/components/Skeleton'
import { badgeUrl } from '@/lib/clubColors'
import { type Profile as ProfileRow, type Team, useDuels, useIqRows } from '@/lib/data'
import { levelFor, MAX_LEVEL, TITLES } from '@shared/level.ts'
import { duelRecord, iqSummary, playerIq } from '@/lib/standings'
import { supabase } from '@/lib/supabase'

export function Profile({ profile, club }: { profile: ProfileRow; club: Team | undefined }) {
  const iq = useIqRows()
  const duels = useDuels()
  if (!iq.data || !duels.data) return <CardsSkeleton count={4} />
  const s = iqSummary(iq.data.individual, iq.data.club, profile.id)
  const { total, peak } = playerIq(iq.data.individual, iq.data.club, duels.data, profile.id)
  const rec = duelRecord(duels.data, profile.id)
  // The level comes from the peak; progress to the next one counts from the current IQ.
  const lv = levelFor(peak)
  const base = peak - lv.progress
  const progress = Math.max(0, total - base)
  const pct = lv.needed ? Math.round((progress / lv.needed) * 100) : 100
  const lastDuel = duels.data
    .filter((d) => d.status === 'finished' && d.gameweek_id === s.lastRound && (d.challenger_id === profile.id || d.opponent_id === profile.id))
    .reduce((n, d) => n + ((d.challenger_id === profile.id ? d.challenger_delta : d.opponent_delta) ?? 0), 0)

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-4 rounded-xl bg-white p-4 text-neutral-900 shadow-md">
        {club && <img src={badgeUrl(club.code)} alt="" className="size-16 shrink-0" />}
        <div className="min-w-0">
          <h1 className="font-heading truncate text-4xl leading-none">{profile.nickname}</h1>
          <p className="truncate text-neutral-600">{club ? `${club.name} · ` : ''}Lv {lv.level} {lv.title}</p>
        </div>
      </div>

      <div className="rounded-xl bg-white p-5 text-neutral-900 shadow-md">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-heading text-3xl leading-none">Level {lv.level}</p>
          <p className="text-right font-semibold">{lv.title}</p>
        </div>
        <p className="text-sm text-neutral-500">{lv.about}</p>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-neutral-200" role="progressbar"
          aria-valuemin={0} aria-valuemax={lv.needed ?? 1} aria-valuenow={lv.needed ? progress : 1}
          aria-label={`Postup na level ${Math.min(lv.level + 1, MAX_LEVEL)}`}>
          <div className="h-full rounded-full bg-[var(--club-primary)]" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-sm">
          {lv.needed
            ? `${progress} / ${lv.needed} IQ · ešte ${lv.needed - (total - base)} IQ na level ${lv.level + 1}`
            : 'Najvyšší level. Viac sa už nedá.'}
        </p>
        {total < base && (
          <p className="mt-1 text-sm text-neutral-500">Duel ti ubral IQ pod hranicu levelu, level si však držíš.</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white p-4 text-neutral-900 shadow-md">
          <p className="text-sm text-neutral-500">IQ spolu</p>
          <p className="scoreboard text-4xl">{total}</p>
        </div>
        <div className="rounded-xl bg-white p-4 text-neutral-900 shadow-md">
          <p className="text-sm text-neutral-500">{s.lastRound ? `Posledné kolo (${s.lastRound}.)` : 'Posledné kolo'}</p>
          <p className="scoreboard text-4xl">{s.lastRoundIndividual + s.lastRoundClub + lastDuel}</p>
          {s.lastRound && (
            <p className="text-xs text-neutral-500">
              zápasy {s.lastRoundIndividual} · klub {s.lastRoundClub}{lastDuel ? ` · duel ${lastDuel > 0 ? '+' : ''}${lastDuel}` : ''}
            </p>
          )}
        </div>
      </div>

      <div className="rounded-xl bg-white p-4 text-neutral-900 shadow-md">
        <h2 className="mb-2 font-semibold">Duely</h2>
        {rec.won + rec.drawn + rec.lost === 0 ? (
          <p className="text-sm text-neutral-600">Zatiaľ žiadny odohraný duel. Kamoša vyzveš v záložke Duely.</p>
        ) : (
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div><dt className="text-xs text-neutral-500">Bilancia V–R–P</dt><dd className="scoreboard text-2xl">{rec.won}–{rec.drawn}–{rec.lost}</dd></div>
            <div><dt className="text-xs text-neutral-500">IQ z duelov</dt><dd className="scoreboard text-2xl">{rec.net > 0 ? '+' : ''}{rec.net}</dd></div>
            <div><dt className="text-xs text-neutral-500">Najdlhšia séria</dt><dd className="scoreboard text-2xl">{rec.bestStreak}</dd></div>
          </dl>
        )}
      </div>

      <PushToggle />

      <div className="rounded-xl bg-white p-4 text-neutral-900 shadow-md">
        <h2 className="mb-2 font-semibold">Tituly</h2>
        <ol className="space-y-1 text-sm">
          {TITLES.map((t, i) => {
            const to = TITLES[i + 1] ? TITLES[i + 1].from - 1 : MAX_LEVEL
            const mine = lv.title === t.title
            return (
              <li key={t.title} className={`flex justify-between rounded-md px-2 py-1 ${mine ? 'bg-neutral-100 font-semibold' : ''}`}>
                <span>{t.title} <span className="text-neutral-500">· {t.about}</span></span>
                <span className="text-neutral-500">{t.from === to ? `level ${to}` : `level ${t.from}–${to}`}</span>
              </li>
            )
          })}
        </ol>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Link to="/pravidla" className="inline-flex items-center gap-2 font-semibold underline underline-offset-4">
          <BookOpen className="size-4" aria-hidden /> Ako sa hrá
        </Link>
        <button className="inline-flex items-center gap-2 text-sm underline underline-offset-4" onClick={() => supabase.auth.signOut()}>
          <LogOut className="size-4" aria-hidden /> Odhlásiť sa
        </button>
      </div>
    </section>
  )
}
