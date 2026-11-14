import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorText, supabase } from '@/lib/supabase'
import { AuthCard } from './Login'

export function Onboarding() {
  const qc = useQueryClient()
  const [nickname, setNickname] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const { error } = await supabase.rpc('complete_profile', { p_nickname: nickname, p_invite_code: code })
    setBusy(false)
    if (error) return setError(errorText(error))
    qc.invalidateQueries({ queryKey: ['profiles'] })
  }

  return (
    <AuthCard title="Ešte prezývka, pod ktorou ťa kamoši uvidia v tabuľke.">
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="nick">Prezývka</Label>
          <Input id="nick" required minLength={2} maxLength={20} value={nickname} onChange={(e) => setNickname(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="code">Pozývací kód</Label>
          <Input id="code" required value={code} onChange={(e) => setCode(e.target.value)} />
          <p className="text-xs text-neutral-500">Dostaneš ho od toho, kto hru založil.</p>
        </div>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <Button type="submit" disabled={busy} className="h-11 w-full text-base">Uložiť prezývku</Button>
      </form>
    </AuthCard>
  )
}
