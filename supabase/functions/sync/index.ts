import { createClient } from 'npm:@supabase/supabase-js@2'
import { fpl } from './fpl.ts'
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
    return Response.json(await runSync(db, fpl))
  } catch (e) {
    console.error(e)
    return Response.json({ error: String(e) }, { status: 500 })
  }
})
