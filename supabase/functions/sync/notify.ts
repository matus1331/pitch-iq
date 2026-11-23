import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

export interface NotifyFixture {
  id: number
  gameweek_id: number | null
  kickoff_time: string | null
  started: boolean
  finished: boolean
}

export interface Notice {
  gameweek: number
  kind: 'reminder' | 'results'
  /** Per user: the push payload. */
  messages: Map<string, { title: string; body: string; url: string }>
}

const DAY = 86400e3

function zapasy(n: number): string {
  return n === 1 ? '1 zápas' : n < 5 ? `${n} zápasy` : `${n} zápasov`
}

/** Which round notifications are due now. Pure, so it can be tested without a database. */
export function dueNotices(
  fixtures: NotifyFixture[],
  tips: { user_id: string; fixture_id: number }[],
  users: string[],
  sent: Set<string>,
  now: number,
  lineupAlerts: Set<string> = new Set(),
): Notice[] {
  const rounds = new Map<number, NotifyFixture[]>()
  for (const f of fixtures) if (f.gameweek_id != null) rounds.set(f.gameweek_id, [...(rounds.get(f.gameweek_id) ?? []), f])
  const tipped = new Set(tips.map((t) => `${t.user_id}:${t.fixture_id}`))
  const out: Notice[] = []

  for (const [gw, fx] of rounds) {
    const first = Math.min(...fx.filter((f) => f.kickoff_time).map((f) => Date.parse(f.kickoff_time!)))
    if (!sent.has(`${gw}:reminder`) && first > now && first - now <= DAY) {
      const open = fx.filter((f) => f.kickoff_time && !f.started)
      const messages = new Map<string, { title: string; body: string; url: string }>()
      for (const u of users) {
        const missing = open.filter((f) => !tipped.has(`${u}:${f.id}`)).length
        const injured = lineupAlerts.has(u)
        if (missing || injured) {
          const parts = [missing && `Ešte nemáš natipované ${zapasy(missing)}.`, injured && 'V zostave máš zraneného hráča.']
          messages.set(u, {
            title: `${gw}. kolo začína o menej ako 24 hodín`,
            body: parts.filter(Boolean).join(' '),
            url: missing ? '/' : '/klub',
          })
        }
      }
      out.push({ gameweek: gw, kind: 'reminder', messages })
    }
    if (!sent.has(`${gw}:results`) && fx.every((f) => f.finished)) {
      const msg = { title: `${gw}. kolo je odohrané`, body: 'Pozri sa, koľko IQ si získal.', url: '/tabulky' }
      out.push({ gameweek: gw, kind: 'results', messages: new Map(users.map((u) => [u, msg])) })
    }
  }
  return out
}

function must<T>(r: { data: T | null; error: unknown }): T {
  if (r.error) throw r.error
  return (r.data ?? []) as T
}

const FLAGGED = new Set(['i', 's', 'u', 'n', 'd'])

/** Users whose latest saved lineup (greatest kickoff, ties by fixture id) has a flagged player. */
async function injuredLineups(db: SupabaseClient, users: string[], fixtures: NotifyFixture[]): Promise<Set<string>> {
  const kickoff = new Map(fixtures.map((f) => [f.id, Date.parse(f.kickoff_time ?? '') || 0]))
  const out = new Set<string>()
  // One query per user keeps each under PostgREST's 1000-row cap (a season is ~190 rows per user).
  for (const u of users) {
    const rows = must(await db.from('club_lineups').select('fixture_id, player_id').eq('user_id', u)) as { fixture_id: number; player_id: number }[]
    let latest = -1
    for (const r of rows) {
      const k = kickoff.get(r.fixture_id) ?? 0, c = kickoff.get(latest) ?? 0
      if (latest < 0 || k > c || (k === c && r.fixture_id > latest)) latest = r.fixture_id
    }
    const ids = rows.filter((r) => r.fixture_id === latest).map((r) => r.player_id)
    if (!ids.length) continue
    const players = must(await db.from('players').select('status').in('id', ids)) as { status: string | null }[]
    if (players.some((p) => p.status && FLAGGED.has(p.status))) out.add(u)
  }
  return out
}

/** Sends due round notifications. No-op without VAPID keys (local dev, tests). */
export async function runNotify(db: SupabaseClient): Promise<{ sent: number }> {
  const pub = Deno.env.get('VAPID_PUBLIC_KEY'), priv = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!pub || !priv) return { sent: 0 }
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com', pub, priv)

  const subs: { endpoint: string; user_id: string; p256dh: string; auth: string }[] =
    must(await db.from('push_subscriptions').select('endpoint, user_id, p256dh, auth'))
  const fixtures: NotifyFixture[] = must(await db.from('fixtures').select('id, gameweek_id, kickoff_time, started, finished'))
  const sentRows: { gameweek_id: number; kind: string }[] = must(await db.from('notifications_sent').select('gameweek_id, kind'))
  const sent = new Set(sentRows.map((r) => `${r.gameweek_id}:${r.kind}`))
  // Only rounds that still owe a notification need their tips.
  const ids = fixtures
    .filter((f) => f.gameweek_id != null && (!sent.has(`${f.gameweek_id}:reminder`) || !sent.has(`${f.gameweek_id}:results`)))
    .map((f) => f.id)
  const tips: { user_id: string; fixture_id: number }[] = ids.length
    ? must(await db.from('match_tips').select('user_id, fixture_id').in('fixture_id', ids))
    : []
  const users = [...new Set(subs.map((s) => s.user_id))]
  // Only look at lineups when some reminder is actually due.
  const now = Date.now()
  const lineupAlerts = dueNotices(fixtures, tips, users, sent, now).some((n) => n.kind === 'reminder')
    ? await injuredLineups(db, users, fixtures)
    : new Set<string>()

  let count = 0
  for (const n of dueNotices(fixtures, tips, users, sent, now, lineupAlerts)) {
    // Claim first: a parallel sync run must not send the same notification twice.
    // ponytail: no retry, a device whose push service is down at that moment misses this one.
    const claimed = must(await db.from('notifications_sent')
      .upsert({ gameweek_id: n.gameweek, kind: n.kind }, { onConflict: 'gameweek_id,kind', ignoreDuplicates: true })
      .select())
    if (!(claimed as unknown[]).length) continue
    for (const s of subs) {
      const msg = n.messages.get(s.user_id)
      if (!msg) continue
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 6 * 3600 })
        count++
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        // Gone: the user turned notifications off or reinstalled the app.
        if (status === 404 || status === 410) await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
        else console.error('push failed', status, e)
      }
    }
  }
  return { sent: count }
}
