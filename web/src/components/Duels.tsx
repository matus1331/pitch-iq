import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { levelFor } from '@shared/level.ts'
import type { MatchTip } from '@/components/MatchTipCard'
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
/** Match duels per player and round; a withdrawal after seeing the opponent's side counts too. */
export const MATCH_DUELS_PER_ROUND = 3

const PICK_LABEL: Record<DuelPick, string> = { H: '1', D: 'X', A: '2', HD: '1X', DA: 'X2', HA: '12' }
/** What the challenger may pick against the opponent's side: the two other results and the double chance on them. */
const PICKS: Record<'H' | 'D' | 'A', DuelPick[]> = { H: ['D', 'A', 'DA'], D: ['H', 'A', 'HA'], A: ['H', 'D', 'HD'] }
const half = (stake: number) => Math.floor(stake / 2)
const bonus = (stake: number) => stake + half(stake)
const sideOfTip = (t: MatchTip): 'H' | 'D' | 'A' =>
  t.kind === '1x2' ? t.outcome! : t.home_goals! > t.away_goals! ? 'H' : t.home_goals! < t.away_goals! ? 'A' : 'D'

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
    levelOf: (u: string) => levelFor(iqSummary(iq.data.individual, iq.data.club, u).total).level,
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
  // My own tips on those matches: the side I accept a match duel with.
  const tips = useQuery({
    queryKey: ['match_tips', 'duels', fixtureIds],
    enabled: fixtureIds.length > 0,
    queryFn: async () => must(await supabase.from('match_tips').select('*').eq('user_id', userId).in('fixture_id', fixtureIds)) as MatchTip[],
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
        const respond = (accept: boolean) => call(supabase.rpc('respond_duel', { p_duel: d.id, p_accept: accept }), accept ? 'Duel prijatý' : 'Duel odmietnutý')
        const cancel = () => call(supabase.rpc('cancel_duel', { p_duel: d.id }), d.status === 'pending' ? 'Výzva zrušená' : 'Duel odmietnutý')
        if (d.category === 'match') {
          const f = fixtures.data?.find((x) => x.id === d.fixture_id)
          return (
            <div key={d.id} className="rounded-xl bg-white p-4 text-neutral-900 shadow-md">
              <p className="text-sm text-neutral-500">Zápasový duel s {name(rival)} o {d.stake} R · {matchName(f, teams.data?.byId)}</p>
              <MatchDuelBody d={d} rival={name(rival)} iChallenged={iChallenged} free={s.respect(userId).free}
                myTip={tips.data?.find((t) => t.fixture_id === d.fixture_id)} onRespond={respond} onCancel={cancel}
                onPick={(p) => call(supabase.rpc('pick_duel', { p_duel: d.id, p_pick: p }), `Hráš na ${PICK_LABEL[p]}`)} />
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

/** Duels waiting for my move: an incoming challenge, or my side in an accepted match duel. */
const needsMe = (d: Duel, me: string) => (d.status === 'pending' && d.opponent_id === me)
  || (d.status === 'accepted' && d.category === 'match' && d.challenger_id === me && !d.challenger_pick)

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

function MatchDuelBody({ d, rival, iChallenged, free, myTip, onRespond, onCancel, onPick }: {
  d: Duel; rival: string; iChallenged: boolean; free: number; myTip: MatchTip | undefined
  onRespond: (accept: boolean) => void; onCancel: () => void; onPick: (p: DuelPick) => void
}) {
  if (d.status === 'pending' && !iChallenged) {
    const side = myTip && sideOfTip(myTip)
    return (
      <>
        <p className="font-semibold">{rival} ťa vyzýva na duel o tento zápas.</p>
        <p className="text-sm text-neutral-600">
          Prijmeš ho so svojím tipom. {rival} uvidí len tvoju stranu (1, X alebo 2), presné skóre nie, a vyberie si inú.
          Po prijatí môžeš skóre ešte zmeniť, víťaza už nie.
        </p>
        {side
          ? <p className="mt-2 text-sm">Tvoja strana: <b className="scoreboard text-lg">{PICK_LABEL[side]}</b></p>
          : <p className="mt-2 text-sm text-red-700">
              Najprv si tento zápas{' '}
              <Link to={`/?kolo=${d.gameweek_id}&zapas=${d.fixture_id}`} className="font-semibold underline underline-offset-2">natipuj</Link>.
            </p>}
        {free < d.stake && <p className="mt-1 text-sm text-red-700">Na túto stávku nemáš dosť voľného Rešpektu.</p>}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button onClick={() => onRespond(true)} disabled={!side || free < d.stake}>Prijať duel</Button>
          <Button variant="outline" onClick={() => onRespond(false)}>Odmietnuť</Button>
        </div>
      </>
    )
  }
  if (d.status === 'pending') {
    return (
      <div className="flex items-center justify-between gap-3">
        <p>Čaká sa, či {rival} výzvu prijme. Musí do výkopu zápasu.</p>
        <Button size="sm" variant="ghost" onClick={onCancel}>Zrušiť</Button>
      </div>
    )
  }
  if (d.status === 'declined') return <p>{iChallenged ? `${rival} duel odmietol.` : 'Duel si odmietol.'}</p>
  if (d.status === 'expired') return <p>Výzva prepadla, zápas začal skôr, než ju niekto prijal.</p>
  if (d.status === 'withdrawn') {
    return <p>{iChallenged
      ? `Duel si po prijatí odmietol. Zarátal sa ti medzi ${MATCH_DUELS_PER_ROUND} zápasové duely kola a na tento zápas už ${rival} nevyzveš.`
      : `${rival} si nevybral stranu, duel sa neodohrá.`}</p>
  }

  const theirs = d.opponent_pick!
  if (!d.challenger_pick) {
    if (!iChallenged) return <p>Tvoja strana je <b>{PICK_LABEL[theirs]}</b>. Čaká sa, kým si {rival} do výkopu vyberie svoju.</p>
    return (
      <>
        <p className="font-semibold">{rival} prijal a hrá na <span className="scoreboard text-lg">{PICK_LABEL[theirs]}</span>. Vyber si svoju stranu.</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {PICKS[theirs].map((p) => (
            <Button key={p} variant="outline" onClick={() => onPick(p)} className="h-auto flex-col gap-0 py-2">
              <span className="scoreboard text-xl">{PICK_LABEL[p]}</span>
              <span className="text-xs font-normal opacity-75">{p.length === 2 ? `+${half(d.stake)} / −${d.stake}` : `+${d.stake} / −${d.stake}`} R</span>
            </Button>
          ))}
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          Dvojtip vyhráva častejšie, preto ti prinesie len polovicu stávky. Ak padne výsledok, ktorý nemá nikto, Rešpekt sa nemení.
        </p>
        <Button variant="ghost" className="mt-2 w-full" onClick={onCancel}>Odmietnuť</Button>
        <p className="text-center text-xs text-neutral-500">
          Odmietnutie sa ti zaráta medzi {MATCH_DUELS_PER_ROUND} zápasové duely kola a na tento zápas už {rival} nevyzveš.
        </p>
      </>
    )
  }
  const [me, them] = iChallenged ? [d.challenger_pick, theirs] : [theirs, d.challenger_pick]
  return (
    <>
      <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <span className="truncate font-semibold">Ty · {PICK_LABEL[me]}</span>
        <span className="text-sm text-neutral-500">vs</span>
        <span className="truncate text-right font-semibold">{rival} · {PICK_LABEL[them]}</span>
      </div>
      {d.status === 'finished' ? <Verdict d={d} iChallenged={iChallenged} />
        : <p className="mt-1 text-center text-sm text-neutral-600">Rozhodne výsledok zápasu.</p>}
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
  const ready = stake != null && (kind === 'round' || (kind === 'match' && chosen && !chosen.taken && !chosen.full))
  const underdog = s.levelOf(userId) < s.levelOf(opponent.id)

  async function send() {
    if (!ready) return
    setBusy(true); setError(null)
    const { error } = kind === 'round'
      ? await supabase.rpc('challenge_duel', { p_opponent: opponent.id, p_stake: stake, p_category: 'individual' })
      : await supabase.rpc('challenge_match_duel', { p_opponent: opponent.id, p_fixture: fixtureId, p_stake: stake })
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
        onClick={() => { setKind(null); setFixtureId(null); setStake(null); setError(null); setOpen(true) }}>
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
              {opponent.nickname} prijme so svojím tipom a ty uvidíš len jeho stranu (1, X alebo 2). Potom si vyberieš inú,
              alebo dvojtip (vyhrá len polovicu stávky), alebo duel odmietneš. Za kolo máš {MATCH_DUELS_PER_ROUND} zápasové duely,
              odmietnutie po prijatí sa počíta tiež.
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
