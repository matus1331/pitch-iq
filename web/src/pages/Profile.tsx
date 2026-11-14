import { badgeUrl } from '@/lib/clubColors'
import { type Profile as ProfileRow, type Team, useIqRows } from '@/lib/data'
import { levelFor, MAX_LEVEL, TITLES } from '@/lib/level'
import { iqSummary } from '@/lib/standings'
import { supabase } from '@/lib/supabase'

export function Profile({ profile, club }: { profile: ProfileRow; club: Team | undefined }) {
  const iq = useIqRows()
  if (!iq.data) return <p>Načítavam…</p>
  const s = iqSummary(iq.data.individual, iq.data.club, profile.id)
  const lv = levelFor(s.total)
  const pct = lv.needed ? Math.round((lv.progress / lv.needed) * 100) : 100

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        {club && <img src={badgeUrl(club.code)} alt="" className="size-14 rounded-full bg-white p-1" />}
        <div className="min-w-0">
          <h1 className="font-heading truncate text-4xl leading-none">{profile.nickname}</h1>
          {club && <p className="opacity-85">Tipuje za {club.name}</p>}
        </div>
      </div>

      <div className="rounded-xl bg-white p-5 text-neutral-900 shadow-md">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-heading text-3xl leading-none">Level {lv.level}</p>
          <p className="text-right font-semibold">{lv.title}</p>
        </div>
        <p className="text-sm text-neutral-500">{lv.about}</p>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-neutral-200" role="progressbar"
          aria-valuemin={0} aria-valuemax={lv.needed ?? 1} aria-valuenow={lv.needed ? lv.progress : 1}
          aria-label={`Postup na level ${Math.min(lv.level + 1, MAX_LEVEL)}`}>
          <div className="h-full rounded-full bg-[var(--club-primary)]" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-sm">
          {lv.needed
            ? `${lv.progress} / ${lv.needed} IQ · ešte ${lv.needed - lv.progress} IQ na level ${lv.level + 1}`
            : 'Najvyšší level. Viac sa už nedá.'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white p-4 text-neutral-900 shadow-md">
          <p className="text-sm text-neutral-500">IQ body spolu</p>
          <p className="scoreboard text-4xl">{s.total}</p>
        </div>
        <div className="rounded-xl bg-white p-4 text-neutral-900 shadow-md">
          <p className="text-sm text-neutral-500">{s.lastRound ? `Posledné kolo (${s.lastRound}.)` : 'Posledné kolo'}</p>
          <p className="scoreboard text-4xl">{s.lastRoundIndividual + s.lastRoundClub}</p>
          {s.lastRound && (
            <p className="text-xs text-neutral-500">výsledky {s.lastRoundIndividual} · klub {s.lastRoundClub}</p>
          )}
        </div>
      </div>

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

      <button className="text-sm underline underline-offset-4 opacity-80" onClick={() => supabase.auth.signOut()}>
        Odhlásiť sa
      </button>
    </section>
  )
}
