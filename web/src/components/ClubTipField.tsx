import { useState } from 'react'
import type { TipDef } from '@shared/catalog.ts'
import { Button } from '@/components/ui/button'
import { availability, type PlayerAvailability } from '@/lib/availability'

export interface ClubTip {
  user_id: string
  fixture_id: number
  tip_key: string
  player_id: number | null
  value: number | null
  points: number | null
}
export interface Player extends PlayerAvailability { id: number; web_name: string; position: number }

/** Option text: the injury icon for players who are out, otherwise the role icon and the chance of playing. */
function optionText(p: Player) {
  const a = availability(p)
  if (a.icon) return `${a.icon} ${p.web_name}`
  return `${a.role ? `${a.role.icon} ` : ''}${p.web_name} · ${a.chance} % že nastúpi`
}

/** Tooltip: the role in words and FPL's news, e.g. "Stály hráč · Knock - 75% chance of playing". */
function tooltip(p: Player) {
  const a = availability(p)
  return [a.role?.label, a.note].filter(Boolean).join(' · ') || undefined
}

const POSITION = ['', 'Brankári', 'Obrancovia', 'Záložníci', 'Útočníci']

/** One offered tip: pick it, fill in its answer, save. */
export function ClubTipField({ def, tip, players, editable, full, onSave, onRemove }: {
  def: TipDef
  tip: ClubTip | undefined
  players: Player[]
  editable: boolean
  full: boolean
  onSave: (v: { player_id: number | null; value: number | null }) => Promise<void>
  onRemove: () => Promise<void>
}) {
  const [playerId, setPlayerId] = useState(tip?.player_id?.toString() ?? '')
  const [value, setValue] = useState(tip?.value?.toString() ?? '')
  const [open, setOpen] = useState(false)
  const chosen = !!tip
  const tipped = players.find((p) => p.id === tip?.player_id)
  const playerName = tipped && optionText(tipped)
  const picked = players.find((p) => p.id === Number(playerId))

  const answer = def.input === 'player' ? playerName : def.input === 'number' ? tip?.value : 'áno'

  async function save(e?: React.FormEvent) {
    e?.preventDefault()
    await onSave({
      player_id: def.input === 'player' ? Number(playerId) : null,
      value: def.input === 'number' ? Number(value) : null,
    })
    setOpen(false)
  }

  return (
    <li className={`rounded-xl bg-white p-4 text-neutral-900 shadow-md ${chosen ? 'ring-4 ring-[var(--club-secondary)]' : ''} ${!chosen && full ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{def.label}</p>
          <p className="text-sm text-neutral-500">
            {def.kind === 'player' ? 'Tip na hráča' : 'Tip na tím'} · {def.points} IQ
          </p>
        </div>
        {tip?.points != null && <span className="scoreboard text-2xl">{tip.points} IQ</span>}
      </div>

      {chosen && !open && (
        <div className="mt-2 flex items-center justify-between">
          <p>Tvoj tip: <strong title={tipped && tooltip(tipped)}>{answer}</strong></p>
          {editable && (
            <span className="flex gap-2">
              {def.input !== 'claim' && <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Zmeniť</Button>}
              <Button size="sm" variant="ghost" onClick={onRemove}>Zrušiť</Button>
            </span>
          )}
        </div>
      )}

      {editable && !chosen && !open && (
        <Button className="mt-3 w-full" variant="outline" disabled={full}
          onClick={() => (def.input === 'claim' ? save() : setOpen(true))}>
          {full ? 'Už máš 3 tipy, najprv jeden zruš' : def.input === 'claim' ? 'Tipujem, že sa to stane' : 'Vybrať tento tip'}
        </Button>
      )}

      {editable && open && (
        <form onSubmit={save} className="mt-3 flex gap-2">
          {def.input === 'player' ? (
            <select aria-label="Hráč" required value={playerId} onChange={(e) => setPlayerId(e.target.value)}
              className="h-10 flex-1 rounded-lg border-2 border-neutral-300 bg-white px-2">
              <option value="">Vyber hráča</option>
              {[1, 2, 3, 4].map((pos) => (
                <optgroup key={pos} label={POSITION[pos]}>
                  {players.filter((p) => p.position === pos)
                    .sort((a, b) => Number(!!availability(a).icon) - Number(!!availability(b).icon))
                    .map((p) => <option key={p.id} value={p.id} title={tooltip(p)}>{optionText(p)}</option>)}
                </optgroup>
              ))}
            </select>
          ) : (
            <input aria-label="Počet" type="number" inputMode="numeric" min={0} max={10} required value={value}
              onChange={(e) => setValue(e.target.value)}
              className="scoreboard h-10 w-20 rounded-lg border-2 border-neutral-300 text-center text-xl" />
          )}
          <Button type="submit" className="h-10">Uložiť</Button>
          <Button type="button" variant="ghost" className="h-10" onClick={() => setOpen(false)}>Späť</Button>
        </form>
      )}
      {editable && open && def.input === 'player' && picked && <PickedInfo p={picked} />}
      {editable && open && def.input === 'player' && (
        <p className="mt-2 text-xs text-neutral-500">
          Šanca, že hráč nastúpi, je všeobecný odhad: ako často tento rok začínal v základnej 11, pri zdravotnom
          probléme podľa FPL nižšia. 🟢 stály hráč · 🟡 občas hrá · ⚪ náhradník. Skutočnú zostavu FPL pred zápasom nezverejňuje.
        </p>
      )}
    </li>
  )
}

/** Under the picker, since phones do not show tooltips in a select: role, chance and FPL's news. */
function PickedInfo({ p }: { p: Player }) {
  const a = availability(p)
  return (
    <p className={`mt-2 text-sm ${a.icon || a.note ? 'text-red-700' : 'text-neutral-700'}`}>
      {a.icon ?? a.role?.icon} {a.icon ? a.note : [a.role?.label, `${a.chance} % že nastúpi`, a.note].filter(Boolean).join(' · ')}
    </p>
  )
}
