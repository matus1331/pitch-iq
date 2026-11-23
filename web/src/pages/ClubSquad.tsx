import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CardsSkeleton } from '@/components/Skeleton'
import type { LineupPlayer } from '@/components/LineupStep'
import { availability } from '@/lib/availability'
import type { Profile } from '@/lib/data'
import { sortRows } from '@/lib/squadSort'
import { must, supabase } from '@/lib/supabase'

const POS = ['', 'GK', 'DEF', 'MID', 'FWD']
type Row = LineupPlayer & { mine: number }
type Col = { key: string; label: string; title?: string; get: (r: Row) => string | number | null; text?: boolean }

const COLS: Col[] = [
  { key: 'name', label: 'Hráč', get: (r) => r.web_name, text: true },
  { key: 'pos', label: 'Poz.', get: (r) => r.position },
  { key: 'pts', label: 'Body', title: 'FPL body v sezóne', get: (r) => r.total_points },
  { key: 'form', label: 'Forma', get: (r) => r.form },
  { key: 'min', label: 'Min', title: 'Odohrané minúty', get: (r) => r.minutes },
  { key: 'g', label: 'G', title: 'Góly', get: (r) => r.goals_scored },
  { key: 'a', label: 'A', title: 'Asistencie', get: (r) => r.assists },
  { key: 'mine', label: 'Pre teba', title: 'IQ body, ktoré ti hráč priniesol v zostave', get: (r) => r.mine },
]

/** The club's players with season stats; click a header to sort. */
export function ClubSquad({ profile }: { profile: Profile }) {
  const club = profile.club_team_id!
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: 'pts', dir: -1 })

  const data = useQuery({
    queryKey: ['squad', club, profile.id],
    queryFn: async () => {
      const [players, lineups] = await Promise.all([
        supabase.from('players')
          .select('id, web_name, position, status, chance_next, news, start_pct, total_points, form, minutes, goals_scored, assists')
          .eq('team_id', club),
        supabase.from('club_lineups').select('player_id, points').eq('user_id', profile.id),
      ])
      const mine = new Map<number, number>()
      for (const l of must(lineups) as { player_id: number; points: number | null }[]) {
        mine.set(l.player_id, (mine.get(l.player_id) ?? 0) + (l.points ?? 0))
      }
      return (must(players) as LineupPlayer[]).map((p): Row => ({ ...p, mine: mine.get(p.id) ?? 0 }))
    },
  })

  if (!data.data) return <CardsSkeleton />
  const col = COLS.find((c) => c.key === sort.key)!
  const rows = sortRows(data.data, col.get, sort.dir)
  const click = (c: Col) => setSort(sort.key === c.key ? { key: c.key, dir: sort.dir === 1 ? -1 : 1 } : { key: c.key, dir: c.text ? 1 : -1 })

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-heading text-4xl leading-none">Káder</h1>
        <Link to="/klub" className="underline">Späť na zápas</Link>
      </div>
      <div className="overflow-x-auto rounded-xl bg-white text-neutral-900 shadow-md">
        <table className="w-full min-w-[34rem] border-collapse text-right">
          <thead>
            <tr className="text-xs text-neutral-500">
              {COLS.map((c) => (
                <th key={c.key} scope="col" title={c.title}
                  aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}
                  className={`p-0 font-normal ${c.text ? 'sticky left-0 z-10 bg-white text-left' : ''}`}>
                  <button type="button" onClick={() => click(c)} className={`w-full px-2 py-2 hover:bg-neutral-100 ${c.text ? 'text-left' : ''}`}>
                    {c.label}{sort.key === c.key && (sort.dir === 1 ? ' ▲' : ' ▼')}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {rows.map((p) => {
              const a = availability(p)
              return (
                <tr key={p.id}>
                  <th scope="row" className="sticky left-0 z-10 max-w-40 bg-white px-2 py-2 text-left font-normal">
                    <span className="block truncate font-semibold">{a.icon ?? a.role?.icon} {p.web_name}</span>
                    {a.note && <span className="block truncate text-xs text-neutral-500">{a.note}</span>}
                  </th>
                  <td className="px-2">{POS[p.position]}</td>
                  <td className="scoreboard px-2">{p.total_points ?? '–'}</td>
                  <td className="px-2">{p.form ?? '–'}</td>
                  <td className="px-2">{p.minutes ?? '–'}</td>
                  <td className="px-2">{p.goals_scored ?? '–'}</td>
                  <td className="px-2">{p.assists ?? '–'}</td>
                  <td className="scoreboard px-2">{p.mine}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
