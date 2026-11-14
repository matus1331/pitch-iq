import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { badgeUrl, CLUB_COLORS } from '@/lib/clubColors'
import { useProfiles, useTeams } from '@/lib/data'
import { errorText, supabase } from '@/lib/supabase'

export function ChooseClub() {
  const qc = useQueryClient()
  const teams = useTeams()
  const profiles = useProfiles()
  const [picked, setPicked] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const ownerOf = new Map((profiles.data ?? []).filter((p) => p.club_team_id).map((p) => [p.club_team_id!, p.nickname]))

  async function confirm() {
    if (picked == null) return
    setError(null)
    const { error } = await supabase.rpc('choose_club', { p_team_id: picked })
    if (error) {
      setError(errorText(error))
      qc.invalidateQueries({ queryKey: ['profiles'] })
      return
    }
    qc.invalidateQueries({ queryKey: ['profiles'] })
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <div className="scarf mb-6 h-3 rounded-sm" aria-hidden />
      <h1 className="font-heading text-4xl leading-none">Vyber si klub</h1>
      <p className="mt-2 mb-6 opacity-85">
        Za tento klub budeš tipovať celú sezónu. Každý klub môže mať len jedného hráča a neskôr sa nedá zmeniť.
      </p>
      {teams.isLoading && <p>Načítavam kluby…</p>}
      {teams.data?.list.length === 0 && <p>Kluby ešte nie sú načítané. Spusti synchronizáciu s FPL.</p>}
      <ul className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        {teams.data?.list.map((t) => {
          const owner = ownerOf.get(t.id)
          const selected = picked === t.id
          const colors = CLUB_COLORS[t.short_name]
          return (
            <li key={t.id}>
              <button
                disabled={!!owner}
                onClick={() => setPicked(t.id)}
                aria-pressed={selected}
                aria-label={owner ? `${t.name}, obsadený hráčom ${owner}` : t.name}
                style={selected && colors ? { background: colors.primary, color: colors.text } : undefined}
                className={`flex w-full flex-col items-center gap-1 rounded-lg bg-white p-2 text-neutral-900 transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 disabled:opacity-40 ${selected ? 'ring-4 ring-[var(--club-secondary)]' : ''}`}
              >
                <img src={badgeUrl(t.code)} alt="" className="size-11 rounded-full bg-white p-0.5" loading="lazy" />
                <span className="text-xs font-semibold">{t.short_name}</span>
                <span className="h-4 truncate text-[11px] opacity-60">{owner ?? ''}</span>
              </button>
            </li>
          )
        })}
      </ul>
      {error && <p role="alert" className="mt-4 rounded bg-white p-2 text-sm text-red-700">{error}</p>}
      <Button
        disabled={picked == null}
        onClick={confirm}
        className="mt-6 h-12 w-full bg-white text-base text-neutral-900 hover:bg-white/90"
      >
        {picked == null ? 'Klikni na logo klubu' : `Potvrdiť ${teams.data?.byId.get(picked)?.name}`}
      </Button>
    </div>
  )
}
