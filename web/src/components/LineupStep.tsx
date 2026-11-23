import { useState } from 'react'
import { isPickable, type Slot, SLOTS } from '@shared/lineup.ts'
import type { Player } from '@/components/ClubTipField'
import { Button } from '@/components/ui/button'
import { availability } from '@/lib/availability'

export interface LineupPlayer extends Player {
  total_points: number | null
  form: number | null
  minutes: number | null
  goals_scored: number | null
  assists: number | null
}
export interface Pick { slot: Slot; player_id: number }

/** Pitch rows, attack at the top: forward, then midfielder and free slot, defender, goalkeeper. */
const ROWS: Slot[][] = [['fwd'], ['mid', 'flex'], ['def'], ['gk']]
const SLOT = Object.fromEntries(SLOTS.map((s) => [s.slot, s]))

/**
 * Step 1: five slots on a pitch, a tap opens the club's players for that slot.
 * Without a saved lineup the last one is offered (`suggestion`); any pick then saves the whole lineup.
 */
export function LineupStep({ saved, suggestion, players, onPick, onSaveAll, onNext, canContinue }: {
  saved: Pick[]
  suggestion: Pick[] | null
  players: LineupPlayer[]
  onPick: (slot: Slot, playerId: number | null) => Promise<void>
  onSaveAll: (picks: Pick[]) => Promise<void>
  onNext: () => void
  /** Tips already placed on this match also open the next steps. */
  canContinue?: boolean
}) {
  const [open, setOpen] = useState<Slot | null>(null)
  const draft = saved.length === 0 && suggestion?.length ? suggestion : null
  const picks = draft ?? saved
  const byId = new Map(players.map((p) => [p.id, p]))

  async function choose(slot: Slot, playerId: number | null) {
    setOpen(null)
    if (!draft) return onPick(slot, playerId)
    const rest = draft.filter((p) => p.slot !== slot && p.player_id !== playerId)
    await onSaveAll(playerId == null ? rest : [...rest, { slot, player_id: playerId }])
  }

  return (
    <div className="space-y-3">
      {draft && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-black/25 p-3">
          <p className="font-semibold">Prevzaté z minulého zápasu</p>
          <Button onClick={() => onSaveAll(draft)}>Uložiť zostavu</Button>
        </div>
      )}
      <div className="space-y-3 rounded-xl bg-green-700 p-4 ring-2 ring-white/40">
        {ROWS.map((row) => (
          <div key={row.join()} className="flex justify-center gap-3">
            {row.map((slot) => {
              const p = byId.get(picks.find((x) => x.slot === slot)?.player_id ?? -1)
              const a = p && availability(p)
              return (
                <button key={slot} type="button" aria-expanded={open === slot}
                  aria-label={`${SLOT[slot].label}: ${p ? p.web_name : 'nevybraný'}`}
                  onClick={() => setOpen(open === slot ? null : slot)}
                  className={`w-32 rounded-lg bg-white p-2 text-center text-neutral-900 shadow-md ${open === slot ? 'ring-4 ring-[var(--club-secondary)]' : ''} ${draft ? 'opacity-80' : ''}`}>
                  <span className="block text-xs text-neutral-500">{SLOT[slot].label}</span>
                  <span className="block truncate font-semibold">
                    {p ? `${a?.icon ?? (p.status === 'd' ? '⚠️' : '')} ${p.web_name}`.trim() : '+ Vybrať'}
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
      {open && (
        <PlayerList slot={open} picks={picks} players={players}
          onChoose={(id) => choose(open, id)} onClose={() => setOpen(null)} />
      )}
      <Button className="w-full" disabled={saved.length === 0 && !canContinue} onClick={onNext}>
        {saved.length === 0 && !canContinue ? 'Najprv ulož aspoň jedného hráča' : 'Ďalej: tipy'}
      </Button>
    </div>
  )
}

const num = (n: number | null) => n ?? '–'

/** Players for one slot, best FPL season first; players who are out are greyed out with the reason. */
function PlayerList({ slot, picks, players, onChoose, onClose }: {
  slot: Slot
  picks: Pick[]
  players: LineupPlayer[]
  onChoose: (playerId: number | null) => void
  onClose: () => void
}) {
  const current = picks.find((p) => p.slot === slot)?.player_id
  const list = players.filter((p) => SLOT[slot].positions.includes(p.position))
    .sort((a, b) => (b.total_points ?? 0) - (a.total_points ?? 0))
  const cols = 'grid grid-cols-[1fr_repeat(5,2.5rem)] items-center gap-1 text-right'
  return (
    <div className="rounded-xl bg-white p-3 text-neutral-900 shadow-md">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-heading text-xl">{SLOT[slot].label}</h3>
        <span className="flex gap-2">
          {current != null && <Button size="sm" variant="outline" onClick={() => onChoose(null)}>Odobrať</Button>}
          <Button size="sm" variant="ghost" onClick={onClose}>Zavrieť</Button>
        </span>
      </div>
      <div className={`${cols} px-2 text-xs text-neutral-500`}>
        <span className="text-left">Hráč</span>
        <abbr title="FPL body v sezóne">Body</abbr><abbr title="Forma">Forma</abbr>
        <abbr title="Odohrané minúty">Min</abbr><abbr title="Góly">G</abbr><abbr title="Asistencie">A</abbr>
      </div>
      <ul className="divide-y divide-neutral-200">
        {list.map((p) => {
          const a = availability(p)
          const pickable = isPickable(p.status)
          const elsewhere = picks.find((x) => x.player_id === p.id && x.slot !== slot)
          const note = !pickable ? a.note
            : p.status === 'd' ? `⚠️ ${a.chance} % že nastúpi${a.note ? ` · ${a.note}` : ''}`
            : elsewhere ? `V zostave ako ${SLOT[elsewhere.slot].label.toLowerCase()}, presunie sa sem` : null
          return (
            <li key={p.id}>
              <button type="button" disabled={!pickable || p.id === current} onClick={() => onChoose(p.id)}
                aria-label={`${p.web_name}${note ? `, ${note}` : ''}`}
                className={`${cols} w-full rounded-lg px-2 py-2 hover:bg-neutral-100 disabled:hover:bg-transparent ${!pickable ? 'opacity-40' : ''} ${p.id === current ? 'bg-neutral-100 font-semibold' : ''}`}>
                <span className="min-w-0 text-left">
                  <span className="block truncate">{a.icon ?? a.role?.icon} {p.web_name}</span>
                  {note && <span className={`block text-xs ${pickable && !elsewhere ? 'text-red-700' : 'text-neutral-500'}`}>{note}</span>}
                </span>
                <span className="scoreboard">{num(p.total_points)}</span>
                <span>{num(p.form)}</span>
                <span>{num(p.minutes)}</span>
                <span>{num(p.goals_scored)}</span>
                <span>{num(p.assists)}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
