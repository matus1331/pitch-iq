import { Bell } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { autoPush, declinePush, enablePush } from '@/lib/push'
import { errorText } from '@/lib/supabase'

/** Notifications are on by default, but the browser asks for permission only after a tap, so ask once here. */
export function PushPrompt() {
  const [ask, setAsk] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => { autoPush().then(setAsk, () => setAsk(false)) }, [])
  if (!ask) return null

  async function enable() {
    setBusy(true)
    try {
      if (await enablePush() === 'on') toast.success('Notifikácie sú zapnuté. Vypnúť ich môžeš v Profile.')
    } catch (e) {
      toast.error(errorText(e))
    }
    setAsk(false)
  }

  return (
    <div role="region" aria-label="Notifikácie" className="mx-3 mb-3 rounded-xl bg-white p-4 text-neutral-900 shadow-md">
      <p className="inline-flex items-center gap-2 font-semibold"><Bell className="size-4" aria-hidden /> Zapni si notifikácie</p>
      <p className="mt-1 text-sm text-neutral-600">Pripomenieme ti netipnuté zápasy 24 hodín pred kolom a dáme vedieť, keď je kolo vyhodnotené.</p>
      <div className="mt-3 flex gap-2">
        <Button size="sm" disabled={busy} onClick={enable}>Zapnúť</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => { declinePush(); setAsk(false) }}>Nie, ďakujem</Button>
      </div>
    </div>
  )
}
