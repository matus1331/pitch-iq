import { Link } from 'react-router-dom'

/** A switch with a white pill that slides under the chosen tab; tabs with `to` are links. */
export function PillTabs<T extends string>({ tabs, value, onPick }: {
  tabs: readonly { id: T; label: string; to?: string }[]
  value: T
  onPick?: (id: T) => void
}) {
  const cls = (id: T) => `relative flex items-center justify-center rounded-md py-2 text-center font-semibold transition-colors duration-300 ${tabs.length > 2 ? 'text-sm' : ''} ${value === id ? 'text-neutral-900' : ''}`
  return (
    <div className="relative mb-3 grid rounded-lg bg-black/20 p-1" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
      <span aria-hidden className="absolute inset-y-1 left-1 rounded-md bg-white transition-transform duration-300 ease-out motion-reduce:transition-none"
        style={{ width: `calc((100% - 0.5rem) / ${tabs.length})`, transform: `translateX(${tabs.findIndex((t) => t.id === value) * 100}%)` }} />
      {tabs.map((t) => t.to
        ? <Link key={t.id} to={t.to} aria-current={value === t.id ? 'page' : undefined} className={cls(t.id)}>{t.label}</Link>
        : <button key={t.id} aria-pressed={value === t.id} onClick={() => onPick?.(t.id)} className={cls(t.id)}>{t.label}</button>)}
    </div>
  )
}
