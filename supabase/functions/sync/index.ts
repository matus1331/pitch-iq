import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { syncChampionsLeague } from './clSync.ts'
import { fpl } from './fpl.ts'
import { runNotify } from './notify.ts'
import { simulateRound } from './simulate.ts'
import { runSync } from './sync.ts'

Deno.serve(async (req) => {
  const secret = Deno.env.get('SYNC_SECRET')
  if (!secret || req.headers.get('Authorization') !== `Bearer ${secret}`) {
    return new Response('unauthorized', { status: 401 })
  }
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
  // The two competitions do not depend on each other: a failure of one must not stop the other.
  const pl = await syncPremierLeague(db)
  const cl = await syncChampionsLeague(db, Deno.env.get('FOOTBALL_DATA_KEY'))
  if ('error' in cl) console.error('champions league', cl.error)
  return Response.json({ ...pl, cl }, { status: 'error' in pl ? 500 : 200 })
})

async function syncPremierLeague(db: SupabaseClient) {
  try {
    // Local testing: a simulated round end (scripts/sim-round.sh). Never set in production.
    const { data: sim } = await db.from('app_config').select('value').eq('key', 'sim_round').maybeSingle()
    const result = await runSync(db, sim ? simulateRound(fpl, Number(sim.value)) : fpl)
    // Notifications must not fail the sync: points are already saved.
    const push = await runNotify(db).catch((e) => (console.error('notify', e), { sent: 0 }))
    return { ...result, push }
  } catch (e) {
    console.error(e)
    return { error: String(e) }
  }
}
