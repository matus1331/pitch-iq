import { Bell } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { disablePush, enablePush, needsInstall, pushState, type PushState } from '@/lib/push'
import { errorText } from '@/lib/supabase'

export function PushToggle() {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { pushState().then(setState, () => setState('unsupported')) }, [])
  if (!state) return null

  async function toggle() {
    setBusy(true)
    try {
      const next = state === 'on' ? await disablePush() : await enablePush()
      setState(next)
      if (next === 'on') toast.success('Notifikácie sú zapnuté.')
    } catch (e) {
      toast.error(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const note = state === 'unsupported'
    ? needsInstall()
      ? 'Na iPhone fungujú len v appke na ploche: v Safari klikni na Zdieľať → Pridať na plochu.'
      : 'Tento prehliadač notifikácie nepodporuje.'
    : state === 'denied'
      ? 'Notifikácie máš zakázané. Povoľ ich v nastaveniach telefónu pre PitchIQ.'
      : 'Pripomenieme ti netipnuté zápasy 24 hodín pred kolom a dáme vedieť, keď je kolo vyhodnotené.'

  return (
    <div className="rounded-xl bg-white p-4 text-neutral-900 shadow-md">
      <div className="flex items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 font-semibold"><Bell className="size-4" aria-hidden /> Notifikácie</h2>
        {(state === 'on' || state === 'off') && (
          <Button size="sm" variant={state === 'on' ? 'outline' : 'default'} disabled={busy} onClick={toggle}>
            {state === 'on' ? 'Vypnúť' : 'Zapnúť'}
          </Button>
        )}
      </div>
      <p className="mt-1 text-sm text-neutral-600">{note}</p>
    </div>
  )
}
