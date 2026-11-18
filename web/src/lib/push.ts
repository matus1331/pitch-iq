import { supabase } from './supabase'

const KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

/** 'unsupported' covers iOS Safari outside the home-screen app and builds without a VAPID key. */
export type PushState = 'unsupported' | 'denied' | 'off' | 'on'

export function pushSupported(): boolean {
  return !!KEY && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** iOS shows push only in the installed app: tell the user to add it to the home screen. */
export function needsInstall(): boolean {
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone
}

// Notifications are on by default; this flag remembers that the user turned them off on this device.
const OPT_OUT = 'pitchiq-push-off'
function optedOut(): boolean {
  try { return localStorage.getItem(OPT_OUT) === '1' } catch { return false }
}
function setOptedOut(off: boolean) {
  try { if (off) localStorage.setItem(OPT_OUT, '1'); else localStorage.removeItem(OPT_OUT) } catch { /* private mode */ }
}

/**
 * On app start: with permission already granted, subscribe silently (also re-links the device to the
 * signed-in account). Returns true when the user should be asked, which browsers only allow from a click.
 */
export async function autoPush(): Promise<boolean> {
  if (!pushSupported() || optedOut()) return false
  if (Notification.permission === 'granted') {
    await enablePush().catch((e) => console.error(e))
    return false
  }
  return Notification.permission === 'default'
}

/** The user said no to the prompt: same as turning notifications off in the profile. */
export function declinePush() {
  setOptedOut(true)
}

export function registerServiceWorker() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch((e) => console.error(e))
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.ready
  return (await reg.pushManager.getSubscription()) ? 'on' : 'off'
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

/** Must run from a click: iOS asks for permission only after a user gesture. */
export async function enablePush(): Promise<PushState> {
  if (await Notification.requestPermission() !== 'granted') return Notification.permission === 'denied' ? 'denied' : 'off'
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription())
    ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(KEY!) })
  const j = sub.toJSON()
  const { error } = await supabase.rpc('save_push_subscription', { p_endpoint: j.endpoint, p_p256dh: j.keys!.p256dh, p_auth: j.keys!.auth })
  if (error) { await sub.unsubscribe(); throw error }
  setOptedOut(false)
  return 'on'
}

export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  }
  setOptedOut(true)
  return 'off'
}
