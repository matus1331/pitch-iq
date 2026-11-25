import { useEffect, useState } from 'react'
import { type CardTeam, type MatchTip, MatchTipCard, type SaveTip } from '@/components/MatchTipCard'
import type { Fixture, Profile } from '@/lib/data'
import { timeLeft } from '@/lib/time'

/** One round to tip: how many matches are tipped, then a card per match. Shared by both competitions. */
export function RoundMatches({ round, postponed = [], tips, teamOf, profiles, userId, save, onSaved, exactOnly, target }: {
  round: Fixture[]
  postponed?: Fixture[]
  tips: MatchTip[]
  teamOf: (id: number) => CardTeam
  profiles: Map<string, Profile>
  userId: string
  save: SaveTip
  onSaved: () => void
  exactOnly?: boolean
  /** Scroll to this match and highlight it. */
  target?: number | null
}) {
  useEffect(() => {
    if (target) document.getElementById(`zapas-${target}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [target])

  // Re-render every minute so the countdown stays true.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  const open = round.filter((f) => !f.started && f.kickoff_time && Date.parse(f.kickoff_time) > now)
  const mine = (f: Fixture) => tips.find((t) => t.fixture_id === f.id && t.user_id === userId)
  const tipped = open.filter(mine).length
  const nextKickoff = open.find((f) => !mine(f)) ?? open[0]
  const card = (f: Fixture) => (
    <MatchTipCard
      key={f.id}
      fixture={f}
      highlight={f.id === target}
      exactOnly={exactOnly}
      home={teamOf(f.team_h)}
      away={teamOf(f.team_a)}
      myTip={mine(f)}
      others={tips.filter((t) => t.fixture_id === f.id && t.user_id !== userId)}
      profiles={profiles}
      userId={userId}
      save={save}
      onSaved={onSaved}
    />
  )

  return (
    <>
      {open.length > 0 && (
        <div className="mb-4 rounded-xl bg-black/25 p-3" aria-live="polite">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold">Natipované {tipped} z {open.length} {open.length === 1 ? 'zápasu' : 'zápasov'}</p>
            <span className="scoreboard text-xl">{tipped}/{open.length}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/25">
            <div className="h-full rounded-full bg-[var(--club-secondary)] transition-[width] duration-500" style={{ width: `${(tipped / open.length) * 100}%` }} />
          </div>
          {nextKickoff?.kickoff_time && (
            <p className="mt-2 text-sm">
              {tipped < open.length ? 'Najbližší nenatipovaný zápas' : 'Najbližší zápas'} začína o {timeLeft(Date.parse(nextKickoff.kickoff_time) - now)}. Tip sa zamkne pri výkope.
            </p>
          )}
        </div>
      )}
      <div className="space-y-3">{round.map(card)}</div>
      {postponed.length > 0 && (
        <>
          <h2 className="font-heading mt-8 mb-3 text-2xl">Odložené zápasy</h2>
          <div className="space-y-3">{postponed.map(card)}</div>
        </>
      )}
    </>
  )
}
