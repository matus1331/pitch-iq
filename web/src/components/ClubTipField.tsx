import { useState } from 'react'
import type { TipDef } from '@shared/catalog.ts'
import { Button } from '@/components/ui/button'

export interface ClubTip {
  user_id: string
  fixture_id: number
  tip_key: string
  player_id: number | null
  value: number | null
  points: number | null
}
export interface Player { id: number; web_name: string; position: number }

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
  const playerName = players.find((p) => p.id === tip?.player_id)?.web_name

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
            {def.kind === 'player' ? 'Tip na hráča' : 'Tip na tím'} · {def.points} {def.points === 1 ? 'bod' : def.points < 5 ? 'body' : 'bodov'}
          </p>
        </div>
        {tip?.points != null && <span className="scoreboard text-2xl">{tip.points} b</span>}
      </div>

      {chosen && !open && (
        <div className="mt-2 flex items-center justify-between">
          <p>Tvoj tip: <strong>{answer}</strong></p>
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
          {full ? 'Už máš 3 tipy' : def.input === 'claim' ? 'Tipujem, že sa to stane' : 'Vybrať tento tip'}
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
                  {players.filter((p) => p.position === pos).map((p) => <option key={p.id} value={p.id}>{p.web_name}</option>)}
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
    </li>
  )
}
