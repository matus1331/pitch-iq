import { Outlet, useLocation } from 'react-router-dom'
import { PillTabs } from '@/components/PillTabs'

const TABS = [{ id: 'round', label: 'Kolo', to: '/' }, { id: 'club', label: 'Môj klub', to: '/klub' }] as const

/** The PL tab: the round to tip and my club, under one switch. */
export function PremierLeague() {
  const { pathname } = useLocation()
  return (
    <>
      <PillTabs tabs={TABS} value={pathname.startsWith('/klub') ? 'club' : 'round'} />
      <div key={pathname} className="swap-in"><Outlet /></div>
    </>
  )
}
