import { CalendarDays, ListOrdered, Shield, Swords, Trophy, UserRound } from 'lucide-react'
import { flushSync } from 'react-dom'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { PushPrompt } from '@/components/PushPrompt'
import { type Profile, useDuels, useIqRows } from '@/lib/data'
import { levelFor } from '@shared/level.ts'
import { DUELS_ENABLED } from '@/lib/features'
import { iqSummary } from '@/lib/standings'

const NAV = [
  { to: '/', label: 'Kolo', Icon: CalendarDays },
  { to: '/klub', label: 'Môj klub', Icon: Shield },
  { to: '/tabulky', label: 'Tabuľky', Icon: ListOrdered },
  { to: '/liga-majstrov', label: 'LM', Icon: Trophy },
  { to: '/duely', label: 'Duely', Icon: Swords },
  { to: '/profil', label: 'Profil', Icon: UserRound },
].filter((n) => DUELS_ENABLED || n.to !== '/duely')

export function Shell({ profile }: { profile: Profile }) {
  const iq = useIqRows()
  const duels = useDuels()
  const lv = iq.data && levelFor(iqSummary(iq.data.individual, iq.data.club, profile.id).peak)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const here = NAV.findIndex((n) => n.to === pathname)
  const canMorph = typeof document !== 'undefined' && !!document.startViewTransition
  // Tab change: the old page slides out and the new one in, towards the tapped tab (see index.css).
  // Without view transitions the new page still slides in (.page-enter); modified clicks stay plain links.
  function go(e: React.MouseEvent, to: string, i: number) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || i === here) return
    document.documentElement.dataset.nav = i < here ? 'back' : 'forward'
    if (!canMorph) return
    e.preventDefault()
    document.startViewTransition(() => flushSync(() => { navigate(to); window.scrollTo(0, 0) }))
  }
  // A challenge to answer, or a match duel waiting for my side.
  const challenged = DUELS_ENABLED && duels.data?.some((d) => (d.status === 'pending' && d.opponent_id === profile.id)
    || (d.status === 'accepted' && d.category === 'match' && d.challenger_id === profile.id && !d.challenger_pick))
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <div className="scarf h-3" aria-hidden />
      <header className="flex items-center gap-3 px-4 py-3">
        <img src="/icon-192.png" alt="" className="size-9 rounded-lg" />
        <div className="min-w-0 flex-1">
          <p className="font-heading text-2xl leading-none">PitchIQ</p>
          <p className="truncate text-sm">{profile.nickname}{lv ? ` · Lv ${lv.level} ${lv.title}` : ''}</p>
        </div>
      </header>
      <PushPrompt />
      <main className="page flex-1 px-3 pb-24">
        <div key={pathname} className={canMorph ? '' : 'page-enter'}>
          <Outlet />
        </div>
      </main>
      <nav className="fixed inset-x-0 bottom-0 border-t border-white/15 pb-[env(safe-area-inset-bottom)] bg-[var(--club-primary)]/95 backdrop-blur">
        <ul className="relative mx-auto flex max-w-xl">
          {/* One bar for the whole menu: it glides to the active tab instead of jumping. */}
          <li aria-hidden className={`pointer-events-none absolute top-0 left-0 h-1 transition-[transform,opacity] duration-[400ms] ease-[cubic-bezier(0.34,1.4,0.5,1)] motion-reduce:transition-none ${here < 0 ? 'opacity-0' : ''}`}
            style={{ width: `${100 / NAV.length}%`, transform: `translateX(${Math.max(here, 0) * 100}%)` }}>
            <span className="absolute inset-x-3 top-0 h-1 rounded-b-full bg-[var(--club-secondary)]" />
          </li>
          {NAV.map((n, i) => (
            <li key={n.to} className="flex-1">
              <NavLink
                to={n.to}
                end
                onClick={(e) => go(e, n.to, i)}
                className={({ isActive }) =>
                  `relative flex flex-col items-center gap-0.5 pt-2.5 pb-2 text-xs focus-visible:outline-2 ${isActive ? 'font-bold' : 'font-medium'}`}
              >
                {({ isActive }) => (
                  <>
                    <span className="relative">
                      <n.Icon className={`size-6 transition-transform duration-300 ${isActive ? 'nav-pop scale-110' : ''}`} strokeWidth={isActive ? 2.5 : 1.75} aria-hidden />
                      {n.to === '/duely' && challenged && (
                        <span className="absolute -top-0.5 -right-1.5 size-2.5 rounded-full bg-[var(--club-secondary)] ring-2 ring-[var(--club-primary)]" />
                      )}
                    </span>
                    {n.label}
                    {n.to === '/duely' && challenged && <span className="sr-only">, máš výzvu na duel</span>}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
