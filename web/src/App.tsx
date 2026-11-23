import { Navigate, Route, Routes } from 'react-router-dom'
import { Shell } from '@/components/Shell'
import { PageSkeleton } from '@/components/Skeleton'
import { Toaster } from '@/components/ui/sonner'
import { useMyProfile, useSession, useTeams } from '@/lib/data'
import { ChooseClub } from '@/pages/ChooseClub'
import { ClubMatch } from '@/pages/ClubMatch'
import { ClubSquad } from '@/pages/ClubSquad'
import { DuelsPage } from '@/pages/DuelsPage'
import { DUELS_ENABLED } from '@/lib/features'
import { HowToPlay } from '@/pages/HowToPlay'
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
  if (session === undefined || (session && profile.isLoading)) content = <PageSkeleton />
  else if (!session) content = <Login />
  else if (!profile.data) content = <Onboarding />
  else if (!profile.data.club_team_id) content = <ChooseClub />
  else
    content = (
      <Routes>
        <Route element={<Shell profile={profile.data} />}>
          <Route index element={<Round />} />
          <Route path="klub" element={<ClubMatch profile={profile.data} />} />
          <Route path="klub/kader" element={<ClubSquad profile={profile.data} />} />
          <Route path="tabulky" element={<Standings />} />
          {DUELS_ENABLED && <Route path="duely" element={<DuelsPage />} />}
          <Route path="pravidla" element={<HowToPlay />} />
          <Route path="profil" element={<Profile profile={profile.data} club={club} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    )

  return (
    <>
      <ClubTheme shortName={club?.short_name} />
      <Toaster theme="light" position="top-center" duration={2500} />
      {content}
    </>
  )
}
