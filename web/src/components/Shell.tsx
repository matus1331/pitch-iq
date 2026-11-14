import { flushSync } from 'react-dom'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { type Profile, useDuels, useIqRows } from '@/lib/data'
import { levelFor } from '@shared/level.ts'
import { playerIq } from '@/lib/standings'

const NAV = [
  { to: '/', label: 'Kolo' },
  { to: '/klub', label: 'Môj klub' },
  { to: '/tabulky', label: 'Tabuľky' },
  { to: '/profil', label: 'Profil' },
]

export function Shell({ profile }: { profile: Profile }) {
  const iq = useIqRows()
  const duels = useDuels()
  const lv = iq.data && duels.data && levelFor(playerIq(iq.data.individual, iq.data.club, duels.data, profile.id).peak)
  const navigate = useNavigate()
  const here = NAV.findIndex((n) => n.to === useLocation().pathname)
  // Tab change as a view transition: the page slides towards the tapped tab (see index.css).
  // Browsers without view transitions, and modified clicks, fall through to the plain link.
  function go(e: React.MouseEvent, to: string, i: number) {
    if (!document.startViewTransition || e.metaKey || e.ctrlKey || e.shiftKey || i === here) return
    e.preventDefault()
    document.documentElement.dataset.nav = i < here ? 'back' : 'forward'
    document.startViewTransition(() => flushSync(() => { navigate(to); window.scrollTo(0, 0) }))
  }
  const challenged = duels.data?.some((d) => d.status === 'pending' && d.opponent_id === profile.id)
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <div className="scarf h-3" aria-hidden />
      <header className="flex items-center gap-3 px-4 py-3">
        <img src="/icon-192.png" alt="" className="size-9 rounded-lg" />
        <div className="min-w-0 flex-1">
          <p className="font-heading text-2xl leading-none">PitchIQ</p>
          <p className="truncate text-sm opacity-80">{profile.nickname}{lv ? ` · Lv ${lv.level} ${lv.title}` : ''}</p>
        </div>
      </header>
      <main className="page flex-1 px-3 pb-24">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 border-t border-white/15 bg-[var(--club-primary)]/95 backdrop-blur">
        <ul className="mx-auto flex max-w-xl">
          {NAV.map((n, i) => (
            <li key={n.to} className="flex-1">
              <NavLink
                to={n.to}
                end
                onClick={(e) => go(e, n.to, i)}
                className={({ isActive }) =>
                  `relative block py-3 text-center font-semibold transition-opacity focus-visible:outline-2 ${isActive ? '' : 'opacity-70'}`}
              >
                {({ isActive }) => (
                  <>
                    {isActive && <span className="nav-indicator absolute inset-x-0 top-0 h-1 bg-[var(--club-secondary)]" aria-hidden />}
                    {n.label}
                    {n.to === '/' && challenged && (
                      <span className="ml-1 inline-block size-2.5 rounded-full bg-[var(--club-secondary)] align-middle" aria-label="máš výzvu na duel" />
                    )}
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
