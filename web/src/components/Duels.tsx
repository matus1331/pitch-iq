import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { levelFor } from '@shared/level.ts'
import { Button } from '@/components/ui/button'
import {
  type Duel, type DuelPick, type Fixture, type Profile, type Team,
  useDuels, useIqRows, useProfiles, useRespect, useTeams, useUpcomingFixtures,
} from '@/lib/data'
import { iqSummary } from '@/lib/standings'
import { errorText, must, supabase } from '@/lib/supabase'
import { useRoundGws } from '@/pages/Round'

const STAKES = [5, 10, 20] as const
/** Free Rešpekt both players need to start a duel (the server checks the same). */
export const MIN_DUEL_R = 10
/** Match duels per player and round. */
export const MATCH_DUELS_PER_ROUND = 3

const PICKS: DuelPick[] = ['H', 'HD', 'D', 'DA', 'A']
const PICK_LABEL: Record<DuelPick, string> = { H: '1', HD: '1X', D: 'X', DA: 'X2', A: '2' }
const half = (stake: number) => Math.floor(stake / 2)
const bonus = (stake: number) => stake + half(stake)
const pickOf = (d: Duel, u: string) => d.duel_picks?.find((p) => p.user_id === u)?.pick

/** The five match duel picks; a double chance wins and loses only half the stake. */
function PickChooser({ stake, value, onChange }: { stake: number | null; value: DuelPick | null; onChange: (p: DuelPick) => void }) {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {PICKS.map((p) => (
        <Button key={p} variant={value === p ? 'default' : 'outline'} aria-pressed={value === p} onClick={() => onChange(p)}
          className="h-auto flex-col gap-0 px-1 py-2">
          <span className="scoreboard text-xl">{PICK_LABEL[p]}</span>
          {stake != null && <span className="text-[11px] font-normal opacity-75">±{p.length === 2 ? half(stake) : stake} R</span>}
        </Button>
      ))}
    </div>
  )
}

const MATCH_RULES = 'Ak trafí len jeden z vás, berie stávku (s dvojtipom 1X alebo X2 len polovicu). Ak trafíte obaja alebo nikto, aj pri rovnakom tipe, je to remíza a nikto nič nestratí.'

/** Rešpekt, level and duels for any player; everything duels need to decide. */
export function useDuelStanding(userId: string) {
  const iq = useIqRows()
  const duels = useDuels()
  const respect = useRespect()
  if (!iq.data || !duels.data || !respect.data) return null
  const r = (u: string) => respect.data.get(u) ?? { total: 0, locked: 0, free: 0 }
  return {
    duels: duels.data,
    rows: iq.data,
    me: userId,
    respect: r,
    levelOf: (u: string) => levelFor(iqSummary(iq.data.individual, iq.data.club, u).peak).level,
    /** Match duels a player has used up in a round (same rule as the server). */
    matchDuels: (u: string, gw: number) => duels.data.filter((d) => d.category === 'match' && d.gameweek_id === gw
      && ((['pending', 'accepted', 'finished'].includes(d.status) && [d.challenger_id, d.opponent_id].includes(u))
        || (d.status === 'withdrawn' && d.challenger_id === u))).length,
  }
}

/** The round new round duels are made for (first round with no match started yet). */
export const useDuelRound = () =>
  useQuery({ queryKey: ['duel_round'], queryFn: async () => must(await supabase.rpc('duel_round')) as number | null })

const matchName = (f: Fixture | undefined, teams: Map<number, Team> | undefined) =>
  f && teams ? `${teams.get(f.team_h)?.short_name ?? '?'} – ${teams.get(f.team_a)?.short_name ?? '?'}` : 'zápas'

/** The player's duels: answer challenges, pick a side, follow the score, see the latest results. */
export function DuelPanel({ userId }: { userId: string }) {
  const qc = useQueryClient()
  const profiles = useProfiles()
  const teams = useTeams()
  const s = useDuelStanding(userId)
  const [error, setError] = useState<string | null>(null)
  const all = (s?.duels ?? []).filter((d) => (d.challenger_id === userId || d.opponent_id === userId) && d.status !== 'cancelled')
  const last = Math.max(0, ...all.filter((d) => d.status === 'finished').map((d) => d.gameweek_id))
  const mine = all.filter((d) => d.status === 'pending' || d.status === 'accepted' || d.gameweek_id === last)
    .sort((a, b) => Number(needsMe(b, userId)) - Number(needsMe(a, userId)))
  const fixtureIds = [...new Set(mine.map((d) => d.fixture_id).filter((x): x is number => x != null))]
  const fixtures = useQuery({
    queryKey: ['fixtures', 'duels', fixtureIds],
    enabled: fixtureIds.length > 0,
    queryFn: async () => must(await supabase.from('fixtures').select('*').in('id', fixtureIds)) as Fixture[],
  })
  if (!s || !profiles.data || !mine.length) return null
  const name = (id: string) => profiles.data.find((p) => p.id === id)?.nickname ?? '?'

  const roundIq = (u: string, d: Duel) =>
    s.rows[d.category === 'club' ? 'club' : 'individual'].filter((r) => r.user_id === u && r.gameweek_id === d.gameweek_id).reduce((n, r) => n + r.points, 0)
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
        const respond = (accept: boolean, pick?: DuelPick) =>
          call(supabase.rpc('respond_duel', { p_duel: d.id, p_accept: accept, p_pick: pick }), accept ? 'Duel prijatý' : 'Duel odmietnutý')
        const cancel = () => call(supabase.rpc('cancel_duel', { p_duel: d.id }), 'Výzva zrušená')
        if (d.category === 'match') {
          const f = fixtures.data?.find((x) => x.id === d.fixture_id)
          return (
            <div key={d.id} className="rounded-xl bg-white p-4 text-neutral-900 shadow-md">
              <p className="text-sm text-neutral-500">Zápasový duel s {name(rival)} o {d.stake} R · {matchName(f, teams.data?.byId)}</p>
              <MatchDuelBody d={d} rival={name(rival)} mine={pickOf(d, userId)} theirs={pickOf(d, rival)} iChallenged={iChallenged}
                free={s.respect(userId).free} onRespond={respond} onCancel={cancel} />
            </div>
          )
        }
        return (
          <div key={d.id} className="rounded-xl bg-white p-4 text-neutral-900 shadow-md">
            <p className="text-sm text-neutral-500">Duel s {name(rival)} o {d.stake} R · celé {d.gameweek_id}. kolo</p>
            <RoundDuelBody d={d} rival={name(rival)} iChallenged={iChallenged} underdog={s.levelOf(userId) < s.levelOf(rival)}
              live={[roundIq(userId, d), roundIq(rival, d)]} free={s.respect(userId).free} onRespond={respond} onCancel={cancel} />
          </div>
        )
      })}
    </div>
  )
}

/** Duels waiting for my move: an incoming challenge. */
const needsMe = (d: Duel, me: string) => d.status === 'pending' && d.opponent_id === me

function Verdict({ d, iChallenged }: { d: Duel; iChallenged: boolean }) {
  const delta = (iChallenged ? d.challenger_delta : d.opponent_delta) ?? 0
  return (
    <p className={`mt-1 text-center text-sm ${delta > 0 ? 'font-semibold text-green-800' : ''}`}>
      {delta > 0 ? `Vyhral si a získavaš ${delta} R.` : delta < 0 ? `Prehral si a strácaš ${-delta} R.` : 'Nikto nevyhral, Rešpekt sa nemení.'}
    </p>
  )
}

function RoundDuelBody({ d, rival, iChallenged, underdog, live, free, onRespond, onCancel }: {
  d: Duel; rival: string; iChallenged: boolean; underdog: boolean; live: [number, number]; free: number
  onRespond: (accept: boolean) => void; onCancel: () => void
}) {
  if (d.status === 'pending' && !iChallenged) {
    return (
      <>
        <p className="font-semibold">{rival} ťa vyzýva na duel o celé kolo.</p>
        <p className="text-sm text-neutral-600">
          Kto naberie v kole viac IQ za tipy zápasov, berie {d.stake} R od druhého.
          {underdog && ` Máš nižší level, takže ak vyhráš, dostaneš ${bonus(d.stake)} R.`}
        </p>
        {free < d.stake && <p className="mt-1 text-sm text-red-700">Na túto stávku nemáš dosť voľného Rešpektu.</p>}
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
  return (
    <>
      <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <span className="truncate font-semibold">Ty</span>
        <span className="scoreboard text-3xl" aria-label={`${mineIq} ku ${theirsIq}`}>{mineIq} : {theirsIq}</span>
        <span className="truncate text-right font-semibold">{rival}</span>
      </div>
      {finished ? <Verdict d={d} iChallenged={iChallenged} /> : (
        <p className="mt-1 text-center text-sm">
          {mineIq > theirsIq ? 'Vedieš.' : mineIq < theirsIq ? 'Prehrávaš.' : 'Zatiaľ remíza.'} Skóre je IQ, ktoré ste zatiaľ v kole získali za tipy zápasov.
        </p>
      )}
    </>
  )
}

function MatchDuelBody({ d, rival, mine, theirs, iChallenged, free, onRespond, onCancel }: {
  d: Duel; rival: string; mine: DuelPick | undefined; theirs: DuelPick | undefined; iChallenged: boolean; free: number
  onRespond: (accept: boolean, pick?: DuelPick) => void; onCancel: () => void
}) {
  const [pick, setPick] = useState<DuelPick | null>(null)
  if (d.status === 'pending' && !iChallenged) {
    return (
      <>
        <p className="font-semibold">{rival} ťa vyzýva na duel o tento zápas.</p>
        <p className="text-sm text-neutral-600">Vyber si tip. {rival} už svoj má, uvidíte ho navzájom až po výkope. {MATCH_RULES}</p>
        <div className="mt-3"><PickChooser stake={d.stake} value={pick} onChange={setPick} /></div>
        {free < d.stake && <p className="mt-1 text-sm text-red-700">Na túto stávku nemáš dosť voľného Rešpektu.</p>}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button onClick={() => onRespond(true, pick!)} disabled={!pick || free < d.stake}>Prijať duel</Button>
          <Button variant="outline" onClick={() => onRespond(false)}>Odmietnuť</Button>
        </div>
      </>
    )
  }
  const myPick = mine && <> Tvoj tip: <b className="scoreboard text-lg">{PICK_LABEL[mine]}</b>.</>
  if (d.status === 'pending') {
    return (
      <div className="flex items-center justify-between gap-3">
        <p>Čaká sa, či {rival} výzvu prijme. Musí do výkopu zápasu.{myPick}</p>
        <Button size="sm" variant="ghost" onClick={onCancel}>Zrušiť</Button>
      </div>
    )
  }
  if (d.status === 'declined') return <p>{iChallenged ? `${rival} duel odmietol.` : 'Duel si odmietol.'}</p>
  if (d.status === 'expired') return <p>Výzva prepadla, zápas začal skôr, než ju niekto prijal.</p>
  if (d.status !== 'accepted' && d.status !== 'finished') return null
  return (
    <>
      <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <span className="truncate font-semibold">Ty · {mine ? PICK_LABEL[mine] : '?'}</span>
        <span className="text-sm text-neutral-500">vs</span>
        <span className="truncate text-right font-semibold">{rival} · {theirs ? PICK_LABEL[theirs] : '?'}</span>
      </div>
      {d.status === 'finished' ? <Verdict d={d} iChallenged={iChallenged} />
        : <p className="mt-1 text-center text-sm text-neutral-600">
            {theirs ? 'Rozhodne výsledok zápasu.' : `Tip hráča ${rival} uvidíš po výkope.`}
          </p>}
    </>
  )
}

type Kind = 'round' | 'match'

/** "Vyzvať" button plus the dialog that picks the duel kind, the match and the stake. */
export function ChallengeButton({ opponent, userId, round }: { opponent: Profile; userId: string; round: number | null }) {
  const qc = useQueryClient()
  const ref = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<Kind | null>(null)
  const [fixtureId, setFixtureId] = useState<number | null>(null)
  const [stake, setStake] = useState<number | null>(null)
  const [pick, setPick] = useState<DuelPick | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const s = useDuelStanding(userId)
  const teams = useTeams()
  const upcoming = useUpcomingFixtures(useRoundGws())

  useEffect(() => {
    if (open) ref.current?.showModal()
    else ref.current?.close()
  }, [open])

  if (!s) return null
  const mine = s.respect(userId).free, theirs = s.respect(opponent.id).free
  if (mine < MIN_DUEL_R || theirs < MIN_DUEL_R) {
    return <span className="w-16 text-center text-xs leading-tight text-neutral-500"
      title={`Duel sa dá začať, keď ty aj ${opponent.nickname} máte aspoň ${MIN_DUEL_R} voľného Rešpektu.`}>Málo R na duel</span>
  }
  const pair = (d: Duel) => [d.challenger_id, d.opponent_id].includes(userId) && [d.challenger_id, d.opponent_id].includes(opponent.id)
  const roundBusy = s.duels.some((d) => d.category !== 'match' && d.gameweek_id === round && ['pending', 'accepted'].includes(d.status) && pair(d))
  const matchOptions = (upcoming.data ?? []).map((f) => ({
    f,
    taken: s.duels.some((d) => d.fixture_id === f.id && d.status !== 'cancelled' && pair(d)),
    full: s.matchDuels(userId, f.gameweek_id!) >= MATCH_DUELS_PER_ROUND || s.matchDuels(opponent.id, f.gameweek_id!) >= MATCH_DUELS_PER_ROUND,
  }))
  const chosen = matchOptions.find((o) => o.f.id === fixtureId)
  const ready = stake != null && (kind === 'round' || (kind === 'match' && pick && chosen && !chosen.taken && !chosen.full))
  const underdog = s.levelOf(userId) < s.levelOf(opponent.id)

  async function send() {
    if (!ready) return
    setBusy(true); setError(null)
    const { error } = kind === 'round'
      ? await supabase.rpc('challenge_duel', { p_opponent: opponent.id, p_stake: stake, p_category: 'individual' })
      : await supabase.rpc('challenge_match_duel', { p_opponent: opponent.id, p_fixture: fixtureId, p_stake: stake, p_pick: pick })
    setBusy(false)
    if (error) return setError(errorText(error))
    qc.invalidateQueries({ queryKey: ['duels'] })
    toast.success(`Výzva odoslaná hráčovi ${opponent.nickname}`)
    setOpen(false)
  }

  const kinds = [
    { id: 'round' as const, label: 'Celé kolo', note: roundBusy ? 'už máte duel' : `${round ?? '–'}. kolo`, ok: !roundBusy && round != null },
    { id: 'match' as const, label: 'Zápas', note: 'jeden zápas', ok: matchOptions.some((o) => !o.taken && !o.full) },
  ]
  return (
    <>
      <Button size="sm" variant="outline" className="h-8"
        onClick={() => { setKind(null); setFixtureId(null); setStake(null); setPick(null); setError(null); setOpen(true) }}>
        Vyzvať
      </Button>
      <dialog ref={ref} onClose={() => setOpen(false)}
        className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-xl p-5 text-neutral-900 backdrop:bg-black/60">
        <h2 className="font-heading text-3xl leading-none">Duel s {opponent.nickname}</h2>
        <p className="mt-2 text-sm text-neutral-600">Hráte o Rešpekt (R). Víťaz berie stávku, porazený ju stráca. IQ sa duelom nemení.</p>

        <p className="mt-4 mb-2 text-sm font-semibold">O čo hráte</p>
        <div className="grid grid-cols-3 gap-2">
          {kinds.map((k) => (
            <Button key={k.id} variant={kind === k.id ? 'default' : 'outline'} aria-pressed={kind === k.id} disabled={!k.ok}
              onClick={() => { setKind(k.id); setStake(null) }} className="h-auto flex-col gap-0 py-2">
              <span className="text-base">{k.label}</span>
              <span className="text-xs font-normal opacity-75">{k.note}</span>
            </Button>
          ))}
          <Button variant="outline" disabled className="h-auto flex-col gap-0 py-2">
            <span className="text-base">Môj klub</span>
            <span className="text-xs font-normal opacity-75">pripravujeme</span>
          </Button>
        </div>

        {kind === 'round' && (
          <p className="mt-3 text-sm text-neutral-600">
            V {round}. kole porovnáte IQ za tipy zápasov. Súper musí výzvu prijať do výkopu prvého zápasu.
            {underdog && ` ${opponent.nickname} má vyšší level, ak vyhráš, dostaneš navyše polovicu stávky.`}
          </p>
        )}
        {kind === 'match' && (
          <>
            <p className="mt-3 text-sm text-neutral-600">
              Ty aj {opponent.nickname} si vyberiete tip naslepo, navzájom ho uvidíte až po výkope. {MATCH_RULES} Za kolo
              máš {MATCH_DUELS_PER_ROUND} zápasové duely.
            </p>
            <label className="mt-3 block text-sm font-semibold" htmlFor="duel-fixture">Zápas</label>
            <select id="duel-fixture" className="mt-1 w-full rounded-md border border-neutral-300 bg-white p-2"
              value={fixtureId ?? ''} onChange={(e) => setFixtureId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Vyber zápas</option>
              {matchOptions.map(({ f, taken, full }) => (
                <option key={f.id} value={f.id} disabled={taken || full}>
                  {f.gameweek_id}. kolo · {matchName(f, teams.data?.byId)}{taken ? ' (už ste hrali)' : full ? ' (vyčerpané duely)' : ''}
                </option>
              ))}
            </select>
            {chosen && <p className="mt-1 text-xs text-neutral-500">Zápasové duely v {chosen.f.gameweek_id}. kole: ty {s.matchDuels(userId, chosen.f.gameweek_id!)}/{MATCH_DUELS_PER_ROUND}</p>}
            <p className="mt-4 mb-2 text-sm font-semibold">Tvoj tip</p>
            <PickChooser stake={stake} value={pick} onChange={setPick} />
          </>
        )}

        {kind && (
          <>
            <p className="mt-4 mb-2 text-sm font-semibold">Stávka</p>
            <div className="grid grid-cols-3 gap-2">
              {STAKES.map((v) => (
                <Button key={v} variant={stake === v ? 'default' : 'outline'} aria-pressed={stake === v}
                  disabled={v > mine || v > theirs} onClick={() => setStake(v)} className="h-11 text-base">
                  {v} R
                </Button>
              ))}
            </div>
            <p className="mt-1 text-xs text-neutral-500">Voľný Rešpekt: ty {mine} · {opponent.nickname} {theirs}</p>
          </>
        )}
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Späť</Button>
          <Button disabled={!ready || busy} onClick={send}>Poslať výzvu</Button>
        </div>
      </dialog>
    </>
  )
}
