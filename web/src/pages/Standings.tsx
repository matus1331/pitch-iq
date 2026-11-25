import { useState } from 'react'
import { PillTabs } from '@/components/PillTabs'
import { CardsSkeleton } from '@/components/Skeleton'
import { TipLegend, TipTable } from '@/components/TipTable'
import { useClFixtures, useClTips } from '@/lib/cl'
import { clResults, clRoundName } from '@/lib/clRounds'
import { badgeUrl } from '@/lib/clubColors'
import { useIqRows, useProfiles, useSession, useTeams, useTipResults } from '@/lib/data'
import { rankRows, type TipStats, tipStats, totals } from '@/lib/standings'

type Board = 'individual' | 'club' | 'cl'
const BOARDS: { id: Board; label: string; about: string }[] = [
  { id: 'individual', label: 'Premier League', about: 'IQ za tipy na výsledky zápasov.' },
  { id: 'club', label: 'Môj klub', about: 'IQ za zostavu a tipy na zápasy vlastného klubu.' },
  { id: 'cl', label: 'Liga majstrov', about: 'IQ za tipy v Lige majstrov.' },
]

export function Standings() {
  const session = useSession()
  const profiles = useProfiles()
  const teams = useTeams()
  const iq = useIqRows()
  const tips = useTipResults()
  const clTips = useClTips()
  const clFixtures = useClFixtures()
  const [board, setBoard] = useState<Board>('individual')
  const [gw, setGw] = useState<number | null>(null)
  const cl = board === 'cl'
  const clRows = clResults(clTips.data ?? [], clFixtures.data ?? [])
  const rows = cl ? clRows : iq.data?.[board] ?? []
  const sources = cl ? [clTips, clFixtures, profiles] : [iq, profiles]
  const players = (profiles.data ?? []).filter((p) => board !== 'club' || p.club_team_id)
  // Hit counts and accuracy exist for match tips only; they also break ties in points.
  const stats = board === 'club' ? new Map<string, TipStats>() : tipStats(cl ? clRows : tips.data ?? [], gw)
  const ranked = rankRows(totals(rows, players, gw).map((r) => ({ ...r, exact: stats.get(r.user_id)?.exact, avgError: stats.get(r.user_id)?.avgError })))
  // Club board: the part of each player's points that came from the lineup.
  const lineup = new Map<string, number>()
  if (board === 'club') for (const r of rows) if (gw == null || r.gameweek_id === gw) lineup.set(r.user_id, (lineup.get(r.user_id) ?? 0) + (r.lineup_points ?? 0))
  const nobody = ranked.every((r) => r.points === 0)
  const rounds = [...new Set(rows.map((r) => r.gameweek_id))].sort((a, b) => b - a)
  const clubOf = new Map(players.map((p) => [p.id, p.club_team_id]))

  return (
    <section>
      <h1 className="font-heading mb-3 text-4xl leading-none">Tabuľky</h1>
      <PillTabs tabs={BOARDS} value={board} onPick={(b) => { setBoard(b); setGw(null) }} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm">
        <p>{BOARDS.find((b) => b.id === board)!.about}</p>
        <label className="flex items-center gap-2">
          Zobraziť
          <select value={gw ?? ''} onChange={(e) => setGw(e.target.value ? Number(e.target.value) : null)}
            className="rounded-md bg-white px-2 py-1 text-neutral-900">
            <option value="">celú sezónu</option>
            {rounds.map((r) => <option key={r} value={r}>{cl ? clRoundName(r) : `${r}. kolo`}</option>)}
          </select>
        </label>
      </div>
      {sources.some((q) => q.isError && !q.data) ? <p className="rounded-xl bg-black/25 p-3">Dáta sa nepodarilo načítať. Skús to znova o chvíľu.</p>
        : sources.some((q) => !q.data) ? <CardsSkeleton count={1} height="h-48" /> : (<>
      {nobody && ranked.length > 0 && (
        <p className="swap-in mb-3 rounded-xl bg-black/25 p-3 text-sm">
          {gw ? 'V tomto kole zatiaľ nikto nezískal IQ.' : 'Zatiaľ nikto nemá IQ. Tabuľka sa naplní po prvých odohraných zápasoch.'}
        </p>
      )}
      <TipTable
        rows={ranked}
        me={session?.user.id}
        nobody={nobody}
        swapKey={`${board}-${gw}`}
        stats={board === 'club' ? undefined : stats}
        badgeOf={board === 'club' ? (u) => {
          const team = teams.data?.byId.get(clubOf.get(u) ?? -1)
          return team && { src: badgeUrl(team.code), alt: team.name }
        } : undefined}
        noteOf={board === 'club' ? (u) => `z toho zostava ${lineup.get(u) ?? 0}` : undefined}
      />
      {board !== 'club' && <TipLegend />}
      </>)}
    </section>
  )
}
