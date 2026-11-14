import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { badgeUrl } from '@/lib/clubColors'
import type { Fixture, Profile, Team } from '@/lib/data'
import { errorText, supabase } from '@/lib/supabase'
import { tipState } from '@/lib/tipState'

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

const OUTCOME_LABEL = { H: '1', D: 'X', A: '2' } as const

export function tipLabel(t: MatchTip) {
  return t.kind === '1x2' ? OUTCOME_LABEL[t.outcome!] : `${t.home_goals}:${t.away_goals}`
}

const kickoffFmt = new Intl.DateTimeFormat('sk-SK', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })

export function MatchTipCard({ fixture, home, away, myTip, others, profiles, userId, onSaved }: {
  fixture: Fixture
  home: Team
  away: Team
  myTip: MatchTip | undefined
  others: MatchTip[]
  profiles: Map<string, Profile>
  userId: string
  onSaved: () => void
}) {
  const state = tipState(fixture)
  const [mode, setMode] = useState<'1x2' | 'exact'>(myTip?.kind ?? '1x2')
  const [h, setH] = useState(myTip?.home_goals?.toString() ?? '')
  const [a, setA] = useState(myTip?.away_goals?.toString() ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function save(tip: Partial<MatchTip>) {
    setError(null); setSaved(false)
    const { error } = await supabase.from('match_tips').upsert({
      user_id: userId, fixture_id: fixture.id, outcome: null, home_goals: null, away_goals: null, ...tip,
    })
    if (error) return setError(errorText(error))
    setSaved(true)
    onSaved()
  }

  const score = state === 'scored' || fixture.started
    ? `${fixture.team_h_score ?? 0} : ${fixture.team_a_score ?? 0}`
    : 'vs'

  return (
    <article className="rounded-xl bg-white text-neutral-900 shadow-md">
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 pt-4">
        <div className="flex items-center gap-2">
          <img src={badgeUrl(home.code)} alt="" className="size-8" />
          <span className="font-semibold">{home.name}</span>
        </div>
        <span className="scoreboard text-2xl">{score}</span>
        <div className="flex items-center justify-end gap-2 text-right">
          <span className="font-semibold">{away.name}</span>
          <img src={badgeUrl(away.code)} alt="" className="size-8" />
        </div>
      </header>
      <p className="px-4 pt-1 text-center text-xs text-neutral-500">
        {state === 'postponed' ? 'Zápas je odložený, termín zatiaľ nie je známy.'
          : `${kickoffFmt.format(new Date(fixture.kickoff_time!))}${state === 'scored' ? (fixture.finished ? ' · koniec' : ' · IQ body sú predbežné') : ''}`}
      </p>

      <div className="p-4">
        {state === 'open' ? (
          <>
            <div role="tablist" className="mb-3 grid grid-cols-2 rounded-lg bg-neutral-100 p-1 text-sm">
              {(['1x2', 'exact'] as const).map((m) => (
                <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
                  className={`rounded-md py-1.5 font-semibold ${mode === m ? 'bg-white shadow-sm' : 'text-neutral-500'}`}>
                  {m === '1x2' ? 'Víťaz · 2 IQ' : 'Presný výsledok · 5 IQ'}
                </button>
              ))}
            </div>
            {mode === '1x2' ? (
              <div className="grid grid-cols-3 gap-2">
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
              <form className="flex items-center justify-center gap-3"
                onSubmit={(e) => { e.preventDefault(); save({ kind: 'exact', home_goals: Number(h), away_goals: Number(a) }) }}>
                <input aria-label={`Góly ${home.name}`} inputMode="numeric" type="number" min={0} max={20} required value={h}
                  onChange={(e) => setH(e.target.value)} className="scoreboard h-14 w-16 rounded-lg border-2 border-neutral-300 text-center text-3xl" />
                <span className="scoreboard text-2xl">:</span>
                <input aria-label={`Góly ${away.name}`} inputMode="numeric" type="number" min={0} max={20} required value={a}
                  onChange={(e) => setA(e.target.value)} className="scoreboard h-14 w-16 rounded-lg border-2 border-neutral-300 text-center text-3xl" />
                <Button type="submit" className="h-11">Uložiť tip</Button>
              </form>
            )}
            <p className="mt-2 h-5 text-center text-sm" aria-live="polite">
              {error ? <span className="text-red-700">{error}</span>
                : saved ? <span className="text-green-800">Tip uložený</span>
                : myTip ? <span className="text-neutral-500">Tvoj tip: {tipLabel(myTip)}</span> : null}
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
              Tip: 1 = výhra {home.short_name}, X = remíza, 2 = výhra {away.short_name}, číslo ako 2:1 = presný výsledok.
              IQ = body za tip: 2 za správneho víťaza alebo remízu, 5 za presný výsledok
              {state === 'locked' ? '. Body pribudnú po skončení zápasu.' : '.'}
            </p>
          </>
        )}
      </div>
    </article>
  )
}
