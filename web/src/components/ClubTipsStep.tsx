import { CATALOG_BY_KEY, CATEGORIES } from '@shared/catalog.ts'
import { type ClubTip, ClubTipField, type Player } from '@/components/ClubTipField'
import { Button } from '@/components/ui/button'

/** Step 2: the offered tips grouped by category, at most three of them, or skip. */
export function ClubTipsStep({ tipKeys, mine, players, version, onSave, onRemove, onNext }: {
  tipKeys: string[]
  mine: ClubTip[]
  players: Player[]
  /** Changes after every save, so the fields drop their unsaved input. */
  version: number
  onSave: (key: string, v: { player_id: number | null; value: number | null }) => Promise<void>
  onRemove: (key: string) => Promise<void>
  onNext: () => void
}) {
  return (
    <div className="space-y-3">
      <PickCounter picked={mine.length} />
      {CATEGORIES.map((c) => {
        const keys = tipKeys.filter((k) => CATALOG_BY_KEY[k]?.category === c.key)
        if (keys.length === 0) return null
        const picked = mine.filter((t) => keys.includes(t.tip_key)).length
        return (
          <details key={c.key} open={picked > 0} className="rounded-xl bg-black/25 p-3">
            <summary className="flex cursor-pointer items-center justify-between font-semibold">
              <span className="font-heading text-2xl">{c.label}</span>
              <span className="text-sm">{picked > 0 ? `vybraté ${picked} · ` : ''}{keys.length} {keys.length === 1 ? 'tip' : keys.length < 5 ? 'tipy' : 'tipov'}</span>
            </summary>
            <ul className="mt-3 space-y-3">
              {keys.map((key) => (
                <ClubTipField key={`${key}-${version}`} def={CATALOG_BY_KEY[key]}
                  tip={mine.find((t) => t.tip_key === key)} players={players} editable full={mine.length >= 3}
                  onSave={(v) => onSave(key, v)} onRemove={() => onRemove(key)} />
              ))}
            </ul>
          </details>
        )
      })}
      <Button className="w-full" variant={mine.length ? 'default' : 'outline'} onClick={onNext}>
        {mine.length ? 'Ďalej: zhrnutie' : 'Preskočiť'}
      </Button>
    </div>
  )
}

function PickCounter({ picked }: { picked: number }) {
  return (
    <div className="rounded-xl bg-black/25 p-3" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">Tipy {picked}/3</p>
        <span className="flex gap-1.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className={`size-3.5 rounded-full border-2 border-[var(--club-text)] ${i < picked ? 'bg-[var(--club-text)]' : ''}`} />
          ))}
        </span>
      </div>
      <p className="mt-1 text-sm">
        {picked < 3
          ? 'Tipy sú nepovinné. Vyber si až tri, body dostaneš len za tie, ktoré vyberieš.'
          : 'Máš všetky tri. Ak chceš iný tip, najprv jeden z vybraných zruš.'}
      </p>
    </div>
  )
}
