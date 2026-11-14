import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { CATALOG_BY_KEY } from '@shared/catalog.ts'
import { type ClubTip, ClubTipField, type Player } from '@/components/ClubTipField'
import { badgeUrl } from '@/lib/clubColors'
import { type Fixture, type Profile, useTeams } from '@/lib/data'
import { errorText, must, supabase } from '@/lib/supabase'
import { tipState } from '@/lib/tipState'
import { useRoundGws } from './Round'

interface Offer { fixture_id: number; team_id: number; tip_keys: string[]; voided: boolean }

const kickoffFmt = new Intl.DateTimeFormat('sk-SK', { weekday: 'long', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })

export function ClubMatch({ profile }: { profile: Profile }) {
  const qc = useQueryClient()
  const teams = useTeams()
  const gws = useRoundGws()
  const club = profile.club_team_id!
  const [error, setError] = useState<string | null>(null)

  const data = useQuery({
    queryKey: ['club', club, gws],
    enabled: gws.length > 0,
    queryFn: async () => {
      const fixtures = must(await supabase.from('fixtures').select('*').in('gameweek_id', gws)
        .or(`team_h.eq.${club},team_a.eq.${club}`).order('kickoff_time')) as Fixture[]
      const ids = fixtures.map((f) => f.id)
      const [offers, tips, players] = await Promise.all([
        supabase.from('club_tip_offers').select('*').eq('team_id', club).in('fixture_id', ids),
        supabase.from('club_tips').select('*').eq('user_id', profile.id).in('fixture_id', ids),
        supabase.from('players').select('id, web_name, position').eq('team_id', club).order('web_name'),
      ])
      return {
        fixtures,
        offers: must(offers) as Offer[],
        tips: must(tips) as ClubTip[],
        players: must(players) as Player[],
      }
    },
  })

  const refresh = () => qc.invalidateQueries({ queryKey: ['club', club] })
  async function run(p: PromiseLike<{ error: unknown }>) {
    setError(null)
    const { error } = await p
    if (error) setError(errorText(error))
    refresh()
  }

  if (!teams.data || !data.data) return <p>Načítavam…</p>
  const { fixtures, offers, tips, players } = data.data

  return (
    <section className="space-y-8">
      <div>
        <h1 className="font-heading text-4xl leading-none">Môj klub</h1>
        <p className="opacity-85">Z každej šestice tipov si vyber tri. Pri každom zápase dostaneš inú šesticu.</p>
      </div>
      {error && <p role="alert" className="rounded-lg bg-white p-3 text-red-700">{error}</p>}
      {fixtures.length === 0 && <p>Tvoj klub v tomto ani nasledujúcom kole nehrá.</p>}

      {fixtures.map((f) => {
        const home = f.team_h === club
        const opp = teams.data.byId.get(home ? f.team_a : f.team_h)!
        const offer = offers.find((o) => o.fixture_id === f.id)
        const mine = tips.filter((t) => t.fixture_id === f.id)
        const state = tipState(f)
        const total = mine.reduce((s, t) => s + (t.points ?? 0), 0)
        return (
          <div key={f.id}>
            <div className="mb-3 flex items-center gap-3">
              <img src={badgeUrl(opp.code)} alt="" className="size-10 rounded-full bg-white p-1" />
              <div>
                <h2 className="font-heading text-2xl leading-tight">{home ? 'Doma' : 'Vonku'} proti {opp.name}</h2>
                <p className="text-sm opacity-85">
                  {f.kickoff_time ? kickoffFmt.format(new Date(f.kickoff_time)) : 'Termín zatiaľ nie je známy'}
                  {state === 'scored' && ` · ${f.team_h_score}:${f.team_a_score} · tvoje body ${total}`}
                </p>
              </div>
            </div>
            {offer?.voided || state === 'postponed' ? (
              <p className="rounded-xl bg-white p-4 text-neutral-900">Zápas bol odložený, klubové tipy sú zrušené.</p>
            ) : !offer ? (
              <p className="rounded-xl bg-white p-4 text-neutral-900">
                {state === 'open' ? 'Šestica tipov sa ešte losuje. Skús to o pár minút.' : 'Na tento zápas si klubové tipy nedal.'}
              </p>
            ) : (
              <ul className="space-y-3">
                {offer.tip_keys.map((key) => {
                  const tip = mine.find((t) => t.tip_key === key)
                  if (state !== 'open' && !tip) return null
                  return (
                    <ClubTipField
                      key={`${key}-${data.dataUpdatedAt}`}
                      def={CATALOG_BY_KEY[key]}
                      tip={tip}
                      players={players}
                      editable={state === 'open'}
                      full={mine.length >= 3}
                      onSave={(v) => run(supabase.from('club_tips').upsert({ user_id: profile.id, fixture_id: f.id, tip_key: key, ...v }))}
                      onRemove={() => run(supabase.from('club_tips').delete().match({ user_id: profile.id, fixture_id: f.id, tip_key: key }))}
                    />
                  )
                })}
                {state !== 'open' && mine.length === 0 && (
                  <li className="rounded-xl bg-white p-4 text-neutral-900">Na tento zápas si klubové tipy nedal.</li>
                )}
              </ul>
            )}
          </div>
        )
      })}
    </section>
  )
}
