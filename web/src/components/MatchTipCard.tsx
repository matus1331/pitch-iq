import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { Fixture, Profile } from '@/lib/data'
import { errorText } from '@/lib/supabase'
import { tipState } from '@/lib/tipState'
import { EXACT_ONLY_FROM_GW } from '@shared/scoring.ts'

export interface MatchTip {
  user_id: string
  fixture_id: number
  kind: '1x2' | 'exact'
  outcome: 'H' | 'D' | 'A' | null
  home_goals: number | null
  away_goals: number | null
  points: number | null
  is_final: boolean
}

export type TipInput = Pick<MatchTip, 'kind' | 'outcome' | 'home_goals' | 'away_goals'>
/** Saving is the page's business: each competition has its own tips table. */
export type SaveTip = (fixtureId: number, tip: TipInput) => PromiseLike<{ error: unknown }>
/** A team as the card shows it; `badge` is an image URL, null when the team has none. */
export interface CardTeam { name: string; short_name: string; badge: string | null }

const OUTCOME_LABEL = { H: '1', D: 'X', A: '2' } as const

export function tipLabel(t: MatchTip) {
  return t.kind === '1x2' ? OUTCOME_LABEL[t.outcome!] : `${t.home_goals}:${t.away_goals}`
}

const kickoffFmt = new Intl.DateTimeFormat('sk-SK', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })

export function MatchTipCard({ fixture, home, away, myTip, others, profiles, userId, save: saveTip, onSaved, highlight, exactOnly }: {
  fixture: Fixture
  highlight?: boolean
  /** Never offer or explain 1/X/2 tips, whatever the round number. */
  exactOnly?: boolean
  home: CardTeam
  away: CardTeam
  myTip: MatchTip | undefined
  others: MatchTip[]
  profiles: Map<string, Profile>
  userId: string
  save: SaveTip
  onSaved: () => void
}) {
  const state = tipState(fixture)
  // Rounds before EXACT_ONLY_FROM_GW still offer the 1/X/2 tab.
  const legacy = !exactOnly && (fixture.gameweek_id ?? 0) < EXACT_ONLY_FROM_GW
  const [mode, setMode] = useState<'1x2' | 'exact'>(legacy ? myTip?.kind ?? '1x2' : 'exact')
  const [h, setH] = useState(myTip?.home_goals?.toString() ?? '')
  const [a, setA] = useState(myTip?.away_goals?.toString() ?? '')
  const [error, setError] = useState<string | null>(null)

  // The saved tip can arrive after the first render (loading, refetch): show it in the fields.
  const [savedH, savedA] = [myTip?.home_goals, myTip?.away_goals]
  useEffect(() => {
    if (savedH == null || savedA == null) return
    setH(String(savedH))
    setA(String(savedA))
  }, [savedH, savedA])

  async function save(tip: Partial<TipInput> & Pick<TipInput, 'kind'>) {
    setError(null)
    const { error } = await saveTip(fixture.id, { outcome: null, home_goals: null, away_goals: null, ...tip })
    if (error) return setError(errorText(error))
    toast.success(`Tip uložený: ${home.short_name} – ${away.short_name}`, { id: `tip-${fixture.id}` })
    onSaved()
  }

  // A full exact score saves itself, the same way a tap on 1 / X / 2 does.
  const goals = (v: string) => (/^\d{1,2}$/.test(v) && Number(v) <= 20 ? Number(v) : null)
  const [hg, ag] = [goals(h), goals(a)]
  const changed = hg != null && ag != null && !(myTip?.kind === 'exact' && myTip.home_goals === hg && myTip.away_goals === ag)
  useEffect(() => {
    if (mode !== 'exact' || !changed || state !== 'open') return
    const t = setTimeout(() => save({ kind: 'exact', home_goals: hg!, away_goals: ag! }), 700)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, hg, ag, changed, state])

  const score = state === 'scored' || fixture.started
    ? `${fixture.team_h_score ?? 0} : ${fixture.team_a_score ?? 0}`
    : 'vs'

  return (
    <article id={`zapas-${fixture.id}`} className={`rounded-xl bg-white text-neutral-900 shadow-md ${highlight ? 'ring-4 ring-[var(--club-secondary)]' : ''}`}>
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 pt-4">
        <div className="flex items-center gap-2">
          {home.badge && <img src={home.badge} alt="" className="size-8" />}
          <span className="font-semibold">{home.name}</span>
        </div>
        <span className="scoreboard text-2xl">{score}</span>
        <div className="flex items-center justify-end gap-2 text-right">
          <span className="font-semibold">{away.name}</span>
          {away.badge && <img src={away.badge} alt="" className="size-8" />}
        </div>
      </header>
      <p className="px-4 pt-1 text-center text-xs text-neutral-500">
        {state === 'postponed' ? 'Zápas je odložený, termín zatiaľ nie je známy.'
          : `${kickoffFmt.format(new Date(fixture.kickoff_time!))}${state === 'scored' ? (fixture.finished ? ' · koniec' : ' · IQ sú predbežné') : ''}`}
      </p>

      <div className="p-4">
        {state === 'open' ? (
          <>
            {legacy ? <div role="tablist" className="relative mb-3 grid grid-cols-2 rounded-lg bg-neutral-100 p-1 text-sm">
              <span aria-hidden className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/2)] rounded-md bg-white shadow-sm transition-transform duration-300 ease-out motion-reduce:transition-none"
                style={{ transform: `translateX(${mode === '1x2' ? 0 : 100}%)` }} />
              {(['1x2', 'exact'] as const).map((m) => (
                <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
                  className={`relative rounded-md py-1.5 font-semibold transition-colors duration-300 ${mode === m ? '' : 'text-neutral-500'}`}>
                  {m === '1x2' ? 'Víťaz · 3 IQ' : 'Presný výsledok · až 6 IQ'}
                </button>
              ))}
            </div> : <p className="mb-3 text-center text-sm text-neutral-600">Víťaz alebo remíza <b>3 IQ</b>, presné skóre <b>+3 IQ</b></p>}
            {mode === '1x2' ? (
              <div className="swap-in grid grid-cols-3 gap-2">
                {(['H', 'D', 'A'] as const).map((o) => {
                  const active = myTip?.kind === '1x2' && myTip.outcome === o
                  return (
                    <Button key={o} variant={active ? 'default' : 'outline'} className="h-11 text-base"
                      aria-pressed={active} onClick={() => save({ kind: '1x2', outcome: o })}>
                      {o === 'H' ? `1 · ${home.short_name}` : o === 'D' ? 'X · remíza' : `2 · ${away.short_name}`}
                    </Button>
                  )
                })}
              </div>
            ) : (
              <form className="swap-in flex items-center justify-center gap-3"
                onSubmit={(e) => { e.preventDefault(); if (changed) save({ kind: 'exact', home_goals: hg!, away_goals: ag! }) }}>
                <input aria-label={`Góly ${home.name}`} inputMode="numeric" type="number" min={0} max={20} required value={h}
                  onChange={(e) => setH(e.target.value)} className="scoreboard h-14 w-16 rounded-lg border-2 border-neutral-300 text-center text-3xl" />
                <span className="scoreboard text-2xl">:</span>
                <input aria-label={`Góly ${away.name}`} inputMode="numeric" type="number" min={0} max={20} required value={a}
                  onChange={(e) => setA(e.target.value)} className="scoreboard h-14 w-16 rounded-lg border-2 border-neutral-300 text-center text-3xl" />
              </form>
            )}
            <p className="mt-2 h-5 text-center text-sm" aria-live="polite">
              {error ? <span className="text-red-700">{error}</span>
                : myTip ? <span className="text-neutral-600">Tvoj tip: <b>{tipLabel(myTip)}</b> · uloží sa sám, meniť ho môžeš do výkopu</span>
                : <span className="text-neutral-500">{mode === 'exact' ? 'Zadaj oba počty gólov, tip sa uloží sám.' : 'Ťukni na tip, uloží sa hneď.'}</span>}
            </p>
          </>
        ) : state === 'postponed' ? (
          myTip && <p className="text-center text-sm">Tvoj tip {tipLabel(myTip)} ostáva platný do nového termínu.</p>
        ) : (
          <>
            <ul className="divide-y divide-neutral-100 text-sm">
              <li className="grid grid-cols-[1fr_4rem_3.5rem] pb-1 text-xs text-neutral-500" aria-hidden>
                <span>Hráč</span><span className="text-center">Tip</span><span className="text-right">IQ</span>
              </li>
              {[...(myTip ? [myTip] : []), ...others].map((t) => (
                <li key={t.user_id} className="grid grid-cols-[1fr_4rem_3.5rem] items-center py-1.5">
                  <span className={`truncate ${t.user_id === userId ? 'font-semibold' : ''}`}>{profiles.get(t.user_id)?.nickname ?? '?'}</span>
                  <span className="scoreboard text-center">{tipLabel(t)}</span>
                  <span className="text-right font-semibold">{t.points != null ? `${t.points > 0 ? '+' : ''}${t.points}` : '–'}</span>
                </li>
              ))}
              {!myTip && <li className="py-1.5 text-neutral-500">Tento zápas si netipoval.</li>}
            </ul>
            <p className="mt-2 border-t border-neutral-100 pt-2 text-xs leading-relaxed text-neutral-500">
              {!exactOnly && <>Tip: 1 = výhra {home.short_name}, X = remíza, 2 = výhra {away.short_name}, číslo ako 2:1 = presný výsledok.{' '}</>}
              IQ = body za tip: 3 za správneho víťaza alebo remízu, ďalšie 3 za presný výsledok
              {state === 'locked' ? '. Body pribudnú po skončení zápasu.' : '.'}
            </p>
          </>
        )}
      </div>
    </article>
  )
}
