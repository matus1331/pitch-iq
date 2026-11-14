import type { FplApi } from './sync.ts'

const BASE = 'https://fantasy.premierleague.com/api'

async function get(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, { headers: { 'User-Agent': 'pitchiq' } })
  if (!res.ok) throw new Error(`FPL ${path} → ${res.status}`)
  return res.json()
}

export const fpl: FplApi = {
  fetchBootstrap: () => get('/bootstrap-static/'),
  fetchFixtures: () => get('/fixtures/') as Promise<unknown[]>,
  fetchLive: (gw: number) => get(`/event/${gw}/live/`),
}
