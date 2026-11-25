import { Link } from 'react-router-dom'
import type { Row, TieBreak, TipStats } from '@/lib/standings'

const STAT_COLS = [['🎯', 'presný výsledok'], ['✓', 'správny víťaz alebo remíza'], ['✗', 'netrafené'], ['Ø', 'priemerná chyba v góloch na tip']] as const
const fmt = (v: number | null | undefined) => v == null ? '–' : v.toFixed(1).replace('.', ',')

/** Ranked players; with `stats` also the hit counts of result tips. Shared by both competitions. */
export function TipTable({ rows, me, nobody, swapKey, stats, badgeOf, noteOf }: {
  rows: (Row & TieBreak & { rank: number })[]
  me: string | undefined
  /** Nobody has points yet: no ranks. */
  nobody: boolean
  /** Changing it replays the swap animation. */
  swapKey: string
  stats?: Map<string, TipStats>
  badgeOf?: (userId: string) => { src: string; alt: string } | undefined
  noteOf?: (userId: string) => string | undefined
}) {
  const cols = stats
    ? 'grid-cols-[1.5rem_minmax(0,1fr)_repeat(4,2rem)_2.5rem]'
    : 'grid-cols-[1.5rem_minmax(0,1fr)_2.5rem]'
  return (
    <div key={`t-${swapKey}`} className="swap-in overflow-hidden rounded-xl bg-white text-neutral-900 shadow-md">
      <div className={`grid ${cols} items-center gap-x-1 border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-semibold text-neutral-500`}>
        <span>#</span><span>Hráč</span>
        {stats && STAT_COLS.map(([icon, hint]) => (
          <Link key={icon} to="/pravidla#tabulka" title={`${hint} (klikni pre vysvetlenie)`} aria-label={`${hint}, vysvetlenie v pravidlách`}
            className="text-center underline decoration-dotted underline-offset-4">{icon}</Link>
        ))}
        <span className="text-right">IQ</span>
      </div>
      {rows.map((r) => {
        const badge = badgeOf?.(r.user_id)
        const note = noteOf?.(r.user_id)
        const st = stats?.get(r.user_id)
        return (
          <div key={r.user_id} className={`grid ${cols} items-center gap-x-1 border-b border-neutral-100 px-3 py-2.5 text-sm last:border-0 ${r.user_id === me ? 'bg-neutral-100 font-semibold' : ''}`}>
            <span className="scoreboard text-base text-neutral-500">{nobody ? '–' : r.rank}</span>
            <span className="flex min-w-0 items-center gap-1.5">
              {badge && <img src={badge.src} alt={badge.alt} className="size-5" />}
              <span className="truncate">{r.nickname}</span>
              {note && <span className="shrink-0 text-xs font-normal text-neutral-500">{note}</span>}
            </span>
            {stats && <>
              <span className="text-center">{st?.exact ?? 0}</span><span className="text-center">{st?.right ?? 0}</span>
              <span className="text-center">{st?.wrong ?? 0}</span><span className="text-center text-neutral-600">{fmt(st?.avgError)}</span>
            </>}
            <span className="scoreboard text-right text-xl">{r.points}</span>
          </div>
        )
      })}
      {rows.length === 0 && <p className="px-4 py-6 text-center text-neutral-500">Zatiaľ tu nikto nie je.</p>}
    </div>
  )
}

export function TipLegend() {
  return (
    <p className="mt-2 text-xs">
      🎯 presný výsledok · ✓ správny víťaz alebo remíza · ✗ netrafené · Ø priemerná chyba v góloch na tip.
      Pri rovnosti bodov rozhoduje viac presných výsledkov, potom menšia chyba.{' '}
      <Link to="/pravidla#tabulka" className="font-semibold underline underline-offset-4">Podrobné vysvetlenie</Link>
    </p>
  )
}
