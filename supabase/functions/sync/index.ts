import { createClient } from 'npm:@supabase/supabase-js@2'
import { fpl } from './fpl.ts'
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
  try {
    // Local testing: a simulated round end (scripts/sim-round.sh). Never set in production.
    const { data: sim } = await db.from('app_config').select('value').eq('key', 'sim_round').maybeSingle()
    return Response.json(await runSync(db, sim ? simulateRound(fpl, Number(sim.value)) : fpl))
  } catch (e) {
    console.error(e)
    return Response.json({ error: String(e) }, { status: 500 })
  }
})
