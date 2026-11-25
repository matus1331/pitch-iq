import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { RoundHeader } from '@/components/RoundHeader'
import { RoundMatches } from '@/components/RoundMatches'
import { CardsSkeleton } from '@/components/Skeleton'
import { useClFixtures, useClTeams, useClTips } from '@/lib/cl'
import { clRoundName, clRounds, clSplit, FIRST_KNOCKOUT_ROUND } from '@/lib/clRounds'
import { useProfiles, useSession } from '@/lib/data'
import { supabase } from '@/lib/supabase'

/** The same page as the Premier League's Round, over the Champions League's own tables. */
export function ChampionsLeague() {
  const qc = useQueryClient()
  const session = useSession()
  const teams = useClTeams()
  const fixtures = useClFixtures()
  const tips = useClTips()
  const profiles = useProfiles()
  // The choice of rounds must not jump under the player's hands at a kickoff.
  const [opened] = useState(() => Date.now())
  const [picked, setPicked] = useState<number | null>(null)

  if ([teams, fixtures, tips, profiles].some((q) => q.isError && !q.data)) {
    return <p className="rounded-xl bg-black/25 p-3">Dáta sa nepodarilo načítať. Skús to znova o chvíľu.</p>
  }
  if (!session || !teams.data || !fixtures.data || !tips.data || !profiles.data) return <CardsSkeleton />
  const userId = session.user.id
  const { options, initial } = clRounds(fixtures.data, opened)
  const gw = picked ?? initial
  const { round, postponed } = clSplit(fixtures.data, gw, options)
  const ids = new Set(round.map((f) => f.id))
  const total = tips.data.filter((t) => t.user_id === userId && ids.has(t.fixture_id)).reduce((s, t) => s + (t.points ?? 0), 0)

  return (
    <section>
      <RoundHeader eyebrow="Liga majstrov" gw={gw} total={total} options={options} nameOf={clRoundName} onPick={setPicked} />
      {gw != null && gw >= FIRST_KNOCKOUT_ROUND && <p className="mb-3 text-sm">Platí skóre po 90 minútach, bez predĺženia a penált.</p>}
      {round.length === 0 && <p>Pre toto kolo zatiaľ nie sú zápasy.</p>}
      <RoundMatches
        exactOnly
        round={round}
        postponed={postponed}
        tips={tips.data}
        teamOf={(id) => {
          const t = teams.data.get(id)
          return { name: t?.short_name ?? '?', short_name: t?.short_name ?? '?', badge: t?.crest ?? null }
        }}
        profiles={new Map(profiles.data.map((p) => [p.id, p]))}
        userId={userId}
        save={(fixture_id, { home_goals, away_goals }) =>
          supabase.from('cl_match_tips').upsert({ user_id: userId, fixture_id, home_goals, away_goals })}
        onSaved={() => qc.invalidateQueries({ queryKey: ['cl', 'tips'] })}
      />
      <p className="mt-6 text-center text-xs opacity-80">Dáta: football-data.org</p>
    </section>
  )
}
