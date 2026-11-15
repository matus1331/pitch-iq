import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { levelFor } from '@shared/level.ts'
import { Button } from '@/components/ui/button'
import { type Duel, type DuelCategory, type Profile, useDuels, useIqRows, useProfiles } from '@/lib/data'
import { categoryIq, DUEL_CATEGORIES, playerIq } from '@/lib/standings'
import { errorText, must, supabase } from '@/lib/supabase'

const STAKES = [5, 10, 20] as const
/** Free IQ both players need in a category to start a duel in it (challenge_duel checks the same). */
export const MIN_DUEL_IQ = 10

/** IQ, level and the IQ still free to bet per category, for any player; everything duels need to decide. */
export function useDuelStanding(userId: string) {
  const iq = useIqRows()
  const duels = useDuels()
  if (!iq.data || !duels.data) return null
  const of = (u: string) => playerIq(iq.data.individual, iq.data.club, duels.data, u)
  return {
    duels: duels.data,
    rows: iq.data,
    me: userId,
    cat: (u: string, c: DuelCategory) => categoryIq(iq.data[c], duels.data, u, c),
    total: (u: string) => of(u).total,
    levelOf: (u: string) => levelFor(of(u).peak).level,
  }
}

/** The round new duels are made for (first round with no match started yet). */
export const useDuelRound = () =>
  useQuery({ queryKey: ['duel_round'], queryFn: async () => must(await supabase.rpc('duel_round')) as number | null })

const categoryLabel = (c: DuelCategory) => DUEL_CATEGORIES.find((x) => x.id === c)!.label

const bonus = (stake: number) => stake + Math.floor(stake / 2)

/** The player's duels: answer challenges, follow the live score, see the latest results. */
export function DuelPanel({ userId }: { userId: string }) {
  const qc = useQueryClient()
  const profiles = useProfiles()
  const s = useDuelStanding(userId)
  const [error, setError] = useState<string | null>(null)
  if (!s || !profiles.data) return null
  const name = (id: string) => profiles.data.find((p) => p.id === id)?.nickname ?? '?'
  // Open duels, plus how the most recent round's duels ended.
  const all = s.duels.filter((d) => (d.challenger_id === userId || d.opponent_id === userId) && d.status !== 'cancelled')
  const last = Math.max(0, ...all.filter((d) => d.status === 'finished').map((d) => d.gameweek_id))
  const mine = all.filter((d) => d.status === 'pending' || d.status === 'accepted' || d.gameweek_id === last)
    .sort((a, b) => Number(b.status === 'pending' && b.opponent_id === userId) - Number(a.status === 'pending' && a.opponent_id === userId))
  if (!mine.length) return null

  const roundIq = (u: string, d: Duel) =>
    s.rows[d.category].filter((r) => r.user_id === u && r.gameweek_id === d.gameweek_id).reduce((n, r) => n + r.points, 0)
  async function call(p: PromiseLike<{ error: unknown }>, done: string) {
    setError(null)
    const { error } = await p
    if (error) setError(errorText(error))
    else toast.success(done)
    qc.invalidateQueries({ queryKey: ['duels'] })
  }

  return (
    <div className="mb-5 space-y-2">
      {error && <p role="alert" className="rounded-lg bg-white p-3 text-red-700">{error}</p>}
      {mine.map((d) => {
        const iChallenged = d.challenger_id === userId
        const rival = iChallenged ? d.opponent_id : d.challenger_id
        const underdog = s.levelOf(userId) < s.levelOf(rival)
        return (
          <div key={d.id} className="rounded-xl bg-white p-4 text-neutral-900 shadow-md">
            <p className="text-sm text-neutral-500">Duel s {name(rival)} o {d.stake} IQ v kategórii {categoryLabel(d.category)} · {d.gameweek_id}. kolo</p>
            <DuelBody d={d} rival={name(rival)} iChallenged={iChallenged} underdog={underdog}
              live={[roundIq(userId, d), roundIq(rival, d)]} free={s.cat(userId, d.category).free}
              onRespond={(accept) => call(supabase.rpc('respond_duel', { p_duel: d.id, p_accept: accept }), accept ? 'Duel prijatý' : 'Duel odmietnutý')}
              onCancel={() => call(supabase.rpc('cancel_duel', { p_duel: d.id }), 'Výzva zrušená')} />
          </div>
        )
      })}
    </div>
  )
}

function DuelBody({ d, rival, iChallenged, underdog, live, free, onRespond, onCancel }: {
  d: Duel; rival: string; iChallenged: boolean; underdog: boolean; live: [number, number]; free: number
  onRespond: (accept: boolean) => void; onCancel: () => void
}) {
  if (d.status === 'pending' && !iChallenged) {
    return (
      <>
        <p className="font-semibold">{rival} ťa vyzýva na duel.</p>
        <p className="text-sm text-neutral-600">
          Kto naberie v kole viac IQ v kategórii {categoryLabel(d.category)}, berie {d.stake} IQ od druhého.
          {underdog && ` Máš nižší level, takže ak vyhráš, dostaneš ${bonus(d.stake)} IQ.`}
        </p>
        {free < d.stake && <p className="mt-1 text-sm text-red-700">Na túto stávku nemáš v kategórii {categoryLabel(d.category)} dosť voľného IQ.</p>}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button onClick={() => onRespond(true)} disabled={free < d.stake}>Prijať duel</Button>
          <Button variant="outline" onClick={() => onRespond(false)}>Odmietnuť</Button>
        </div>
      </>
    )
  }
  if (d.status === 'pending') {
    return (
      <div className="flex items-center justify-between gap-3">
        <p>Čaká sa, či {rival} výzvu prijme. Musí do výkopu prvého zápasu kola.</p>
        <Button size="sm" variant="ghost" onClick={onCancel}>Zrušiť</Button>
      </div>
    )
  }
  if (d.status === 'declined') return <p>{iChallenged ? `${rival} duel odmietol.` : 'Duel si odmietol.'}</p>
  if (d.status === 'expired') return <p>Výzva prepadla, kolo začalo skôr, než ju niekto prijal.</p>

  const finished = d.status === 'finished'
  const [mineIq, theirsIq] = finished
    ? (iChallenged ? [d.challenger_iq!, d.opponent_iq!] : [d.opponent_iq!, d.challenger_iq!])
    : live
  const delta = (iChallenged ? d.challenger_delta : d.opponent_delta) ?? 0
  const verdict = finished
    ? delta > 0 ? `Vyhral si a získavaš ${delta} IQ.` : delta < 0 ? `Prehral si a strácaš ${-delta} IQ.` : 'Remíza, IQ sa nemení.'
    : mineIq > theirsIq ? 'Vedieš.' : mineIq < theirsIq ? 'Prehrávaš.' : 'Zatiaľ remíza.'
  return (
    <>
      <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <span className="truncate font-semibold">Ty</span>
        <span className="scoreboard text-3xl" aria-label={`${mineIq} ku ${theirsIq}`}>{mineIq} : {theirsIq}</span>
        <span className="truncate text-right font-semibold">{rival}</span>
      </div>
      <p className={`mt-1 text-center text-sm ${finished && delta > 0 ? 'font-semibold text-green-800' : ''}`}>
        {verdict}{!finished && ` Skóre je IQ, ktoré ste zatiaľ v kole získali v kategórii ${categoryLabel(d.category)}.`}
      </p>
    </>
  )
}

/** "Vyzvať" button plus the dialog that picks the category and stake and sends the challenge. */
export function ChallengeButton({ opponent, userId, round }: { opponent: Profile; userId: string; round: number | null }) {
  const qc = useQueryClient()
  const ref = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<DuelCategory | null>(null)
  const [stake, setStake] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const s = useDuelStanding(userId)

  useEffect(() => {
    if (open) ref.current?.showModal()
    else ref.current?.close()
  }, [open])

  if (!s) return null
  async function send() {
    if (stake == null || category == null) return
    setBusy(true); setError(null)
    const { error } = await supabase.rpc('challenge_duel', { p_opponent: opponent.id, p_stake: stake, p_category: category })
    setBusy(false)
    if (error) return setError(errorText(error))
    qc.invalidateQueries({ queryKey: ['duels'] })
    toast.success(`Výzva odoslaná hráčovi ${opponent.nickname}`)
    setOpen(false)
  }

  // One duel per pair and round, whatever the category.
  const busyPair = s.duels.some((d) => d.gameweek_id === round && (d.status === 'pending' || d.status === 'accepted')
    && [d.challenger_id, d.opponent_id].includes(userId) && [d.challenger_id, d.opponent_id].includes(opponent.id))
  if (busyPair) return <span className="w-16 text-center text-xs leading-tight text-neutral-500">V dueli</span>
  const options = DUEL_CATEGORIES.map((c) => {
    const mine = s.cat(userId, c.id).free, theirs = s.cat(opponent.id, c.id).free
    return { ...c, mine, theirs, ok: mine >= MIN_DUEL_IQ && theirs >= MIN_DUEL_IQ }
  })
  if (!options.some((o) => o.ok)) {
    return <span className="w-16 text-center text-xs leading-tight text-neutral-500"
      title={`Duel sa dá začať, keď ty aj ${opponent.nickname} máte v jednej kategórii aspoň ${MIN_DUEL_IQ} voľného IQ.`}>Málo IQ na duel</span>
  }
  const chosen = options.find((o) => o.id === category)
  const underdog = s.levelOf(userId) < s.levelOf(opponent.id)
  return (
    <>
      <Button size="sm" variant="outline" className="h-8"
        onClick={() => { setCategory(options.filter((o) => o.ok).length === 1 ? options.find((o) => o.ok)!.id : null); setStake(null); setError(null); setOpen(true) }}>
        Vyzvať
      </Button>
      <dialog ref={ref} onClose={() => setOpen(false)}
        className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-xl p-5 text-neutral-900 backdrop:bg-black/60">
        <h2 className="font-heading text-3xl leading-none">Duel s {opponent.nickname}</h2>
        <p className="mt-2 text-sm text-neutral-600">
          {round ? `V ${round}. kole` : 'V najbližšom kole'} porovnáte IQ, ktoré naberiete vo zvolenej kategórii.
          Víťaz berie stávku a pripíše si ju do tej kategórie, porazený ju v nej stráca. Súper musí výzvu prijať do výkopu prvého zápasu.
        </p>
        {underdog && (
          <p className="mt-2 rounded-md bg-neutral-100 p-2 text-sm">
            {opponent.nickname} má vyšší level. Ak vyhráš, dostaneš navyše polovicu stávky.
          </p>
        )}
        <p className="mt-4 mb-2 text-sm font-semibold">O čo hráte</p>
        <div className="grid grid-cols-2 gap-2">
          {options.map((o) => (
            <Button key={o.id} variant={category === o.id ? 'default' : 'outline'} aria-pressed={category === o.id} disabled={!o.ok}
              onClick={() => { setCategory(o.id); setStake(null) }} className="h-auto flex-col gap-0 py-2">
              <span className="text-base">{o.label}</span>
              <span className="text-xs font-normal opacity-75">voľné IQ: ty {Math.max(0, o.mine)} · súper {Math.max(0, o.theirs)}</span>
            </Button>
          ))}
        </div>
        {chosen && (
          <>
            <p className="mt-4 mb-2 text-sm font-semibold">Stávka</p>
            <div className="grid grid-cols-3 gap-2">
              {STAKES.map((v) => (
                <Button key={v} variant={stake === v ? 'default' : 'outline'} aria-pressed={stake === v}
                  disabled={v > chosen.mine || v > chosen.theirs} onClick={() => setStake(v)} className="h-11 text-base">
                  {v} IQ
                </Button>
              ))}
            </div>
          </>
        )}
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Späť</Button>
          <Button disabled={stake == null || category == null || busy} onClick={send}>Poslať výzvu</Button>
        </div>
      </dialog>
    </>
  )
}
