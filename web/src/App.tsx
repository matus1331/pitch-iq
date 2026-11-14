import { Navigate, Route, Routes } from 'react-router-dom'
import { Shell } from '@/components/Shell'
import { useMyProfile, useSession, useTeams } from '@/lib/data'
import { ChooseClub } from '@/pages/ChooseClub'
import { ClubMatch } from '@/pages/ClubMatch'
import { Login } from '@/pages/Login'
import { Onboarding } from '@/pages/Onboarding'
import { Profile } from '@/pages/Profile'
import { Round } from '@/pages/Round'
import { Standings } from '@/pages/Standings'
import { ClubTheme } from '@/theme/ClubTheme'

export default function App() {
  const session = useSession()
  const profile = useMyProfile(session?.user.id)
  const teams = useTeams()
  const club = profile.data?.club_team_id ? teams.data?.byId.get(profile.data.club_team_id) : undefined

  let content: React.ReactNode
  if (session === undefined || (session && profile.isLoading)) content = <p className="p-6">Načítavam…</p>
  else if (!session) content = <Login />
  else if (!profile.data) content = <Onboarding />
  else if (!profile.data.club_team_id) content = <ChooseClub />
  else
    content = (
      <Routes>
        <Route element={<Shell profile={profile.data} club={club} />}>
          <Route index element={<Round />} />
          <Route path="klub" element={<ClubMatch profile={profile.data} />} />
          <Route path="tabulky" element={<Standings />} />
          <Route path="profil" element={<Profile profile={profile.data} club={club} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    )

  return (
    <>
      <ClubTheme shortName={club?.short_name} />
      {content}
    </>
  )
}
