import { NavLink, Outlet } from 'react-router-dom'
import { badgeUrl } from '@/lib/clubColors'
import type { Profile, Team } from '@/lib/data'
import { supabase } from '@/lib/supabase'

const NAV = [
  { to: '/', label: 'Kolo' },
  { to: '/klub', label: 'Môj klub' },
  { to: '/tabulky', label: 'Tabuľky' },
]

export function Shell({ profile, club }: { profile: Profile; club: Team | undefined }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <div className="scarf h-3" aria-hidden />
      <header className="flex items-center gap-3 px-4 py-3">
        {club && <img src={badgeUrl(club.code)} alt="" className="size-9" />}
        <div className="min-w-0 flex-1">
          <p className="font-heading text-2xl leading-none">PL Tipovačka</p>
          <p className="truncate text-sm opacity-80">{profile.nickname}{club ? ` za ${club.name}` : ''}</p>
        </div>
        <button className="text-sm underline-offset-4 opacity-80 hover:underline" onClick={() => supabase.auth.signOut()}>
          Odhlásiť sa
        </button>
      </header>
      <main className="flex-1 px-3 pb-24">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 border-t border-white/15 bg-[var(--club-primary)]/95 backdrop-blur">
        <ul className="mx-auto flex max-w-xl">
          {NAV.map((n) => (
            <li key={n.to} className="flex-1">
              <NavLink
                to={n.to}
                end
                className={({ isActive }) =>
                  `block py-3 text-center font-semibold focus-visible:outline-2 ${isActive ? 'border-t-4 border-[var(--club-secondary)]' : 'border-t-4 border-transparent opacity-70'}`}
              >
                {n.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
