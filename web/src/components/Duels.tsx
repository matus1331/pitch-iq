import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { levelFor } from '@shared/level.ts'
import { Button } from '@/components/ui/button'
import { type Duel, type Profile, useDuels, useIqRows, useProfiles } from '@/lib/data'
import { playerIq } from '@/lib/standings'
import { errorText, must, supabase } from '@/lib/supabase'

const STAKES = [5, 10, 20] as const
export const MIN_STAKE = STAKES[0]

/** IQ, level and the IQ still free to bet for one player; everything duels need to decide. */
export function useDuelStanding(userId: string) {
  const iq = useIqRows()
  const duels = useDuels()
  if (!iq.data || !duels.data) return null
  const of = (u: string) => playerIq(iq.data.individual, iq.data.club, duels.data, u)
  // Same rule as the server: accepted duels and own outgoing challenges tie up IQ, incoming ones do not.
  const freeOf = (u: string) => of(u).total - duels.data
    .filter((d) => (d.status === 'accepted' && (d.challenger_id === u || d.opponent_id === u))
      || (d.status === 'pending' && d.challenger_id === u))
    .reduce((n, d) => n + d.stake, 0)
  return {
    duels: duels.data,
    rows: iq.data,
    free: freeOf(userId),
    freeOf,
    levelOf: (u: string) => levelFor(of(u).peak).level,
  }
}

const bonus = (stake: number) => stake + Math.floor(stake / 2)

/** The player's duels in the round on screen: answer challenges, follow the live score, see results. */
export function DuelPanel({ gw, userId }: { gw: number; userId: string }) {
  const qc = useQueryClient()
  const profiles = useProfiles()
  const s = useDuelStanding(userId)
  const [error, setError] = useState<string | null>(null)
  if (!s || !profiles.data) return null
  const name = (id: string) => profiles.data.find((p) => p.id === id)?.nickname ?? '?'
  // This round's duels, plus challenges still waiting for my answer whatever round they are for.
  const mine = s.duels.filter((d) => (d.challenger_id === userId || d.opponent_id === userId) && d.status !== 'cancelled'
    && (d.gameweek_id === gw || (d.status === 'pending' && d.opponent_id === userId)))
  if (!mine.length) return null

  const roundIq = (u: string) =>
    [...s.rows.individual, ...s.rows.club].filter((r) => r.user_id === u && r.gameweek_id === gw).reduce((n, r) => n + r.points, 0)
  async function call(p: PromiseLike<{ error: unknown }>) {
    setError(null)
    const { error } = await p
    if (error) setError(errorText(error))
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
            <p className="text-sm text-neutral-500">Duel s {name(rival)} o {d.stake} IQ · {d.gameweek_id}. kolo</p>
            <DuelBody d={d} rival={name(rival)} iChallenged={iChallenged} underdog={underdog}
              live={[roundIq(userId), roundIq(rival)]} free={s.free}
              onRespond={(accept) => call(supabase.rpc('respond_duel', { p_duel: d.id, p_accept: accept }))}
              onCancel={() => call(supabase.rpc('cancel_duel', { p_duel: d.id }))} />
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
          Kto naberie v kole viac IQ, berie {d.stake} IQ od druhého.
          {underdog && ` Máš nižší level, takže ak vyhráš, dostaneš ${bonus(d.stake)} IQ.`}
        </p>
        {free < d.stake && <p className="mt-1 text-sm text-red-700">Na túto stávku nemáš dosť voľného IQ.</p>}
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
        {verdict}{!finished && ' Skóre je IQ, ktoré ste zatiaľ v kole získali.'}
      </p>
    </>
  )
}

/** "Vyzvať" button plus the dialog that sets the stake and sends the challenge. */
export function ChallengeButton({ opponent, userId }: { opponent: Profile; userId: string }) {
  const qc = useQueryClient()
  const ref = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const [stake, setStake] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const s = useDuelStanding(userId)
  const round = useQuery({
    queryKey: ['duel_round'],
    enabled: open,
    queryFn: async () => must(await supabase.rpc('duel_round')) as number | null,
  })

  useEffect(() => {
    if (open) ref.current?.showModal()
    else ref.current?.close()
  }, [open])

  async function send() {
    if (stake == null) return
    setBusy(true); setError(null)
    const { error } = await supabase.rpc('challenge_duel', { p_opponent: opponent.id, p_stake: stake })
    setBusy(false)
    if (error) return setError(errorText(error))
    qc.invalidateQueries({ queryKey: ['duels'] })
    setOpen(false)
  }

  const underdog = s ? s.levelOf(userId) < s.levelOf(opponent.id) : false
  const theirFree = s?.freeOf(opponent.id) ?? 0
  const locked = !s || s.free < MIN_STAKE || theirFree < MIN_STAKE
  const why = !s ? '' : s.free < MIN_STAKE
    ? `Duely sa ti odomknú, keď budeš mať aspoň ${MIN_STAKE} voľného IQ.`
    : theirFree < MIN_STAKE ? `${opponent.nickname} zatiaľ nemá ${MIN_STAKE} voľného IQ, nedá sa vyzvať.` : ''
  if (s && s.free >= MIN_STAKE && theirFree < MIN_STAKE) {
    return <span className="w-16 text-center text-xs leading-tight text-neutral-500" title={why}>Málo IQ na duel</span>
  }
  return (
    <>
      <Button size="sm" variant="outline" className="h-8" disabled={locked} title={why || undefined} aria-label={why || undefined}
        onClick={() => { setStake(null); setError(null); setOpen(true) }}>
        Vyzvať
      </Button>
      <dialog ref={ref} onClose={() => setOpen(false)}
        className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-xl p-5 text-neutral-900 backdrop:bg-black/60">
        <h2 className="font-heading text-3xl leading-none">Duel s {opponent.nickname}</h2>
        <p className="mt-2 text-sm text-neutral-600">
          {round.data ? `V ${round.data}. kole` : 'V najbližšom kole'} porovnáte, kto naberie viac IQ za svoje tipy.
          Víťaz berie stávku, porazený ju stráca. Súper musí výzvu prijať do výkopu prvého zápasu.
        </p>
        {underdog && (
          <p className="mt-2 rounded-md bg-neutral-100 p-2 text-sm">
            {opponent.nickname} má vyšší level. Ak vyhráš, dostaneš navyše polovicu stávky.
          </p>
        )}
        <p className="mt-4 mb-2 text-sm font-semibold">Stávka · tvoje voľné IQ {s?.free ?? '…'} · súperovo {theirFree}</p>
        <div className="grid grid-cols-3 gap-2">
          {STAKES.map((v) => (
            <Button key={v} variant={stake === v ? 'default' : 'outline'} aria-pressed={stake === v}
              disabled={!s || v > s.free || v > theirFree} onClick={() => setStake(v)} className="h-11 text-base">
              {v} IQ
            </Button>
          ))}
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Späť</Button>
          <Button disabled={stake == null || busy} onClick={send}>Poslať výzvu</Button>
        </div>
      </dialog>
    </>
  )
}
