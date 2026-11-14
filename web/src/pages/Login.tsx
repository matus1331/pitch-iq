import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorText, supabase } from '@/lib/supabase'

export function AuthCard({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <img src="/logo.png" alt="" className="mb-4 size-28 rounded-2xl" />
      <h1 className="font-heading mb-1 text-5xl leading-none">PitchIQ</h1>
      <p className="mb-8 text-lg opacity-85">{title}</p>
      <div className="rounded-xl bg-white p-5 text-neutral-900 shadow-lg">{children}</div>
    </div>
  )
}

export function Login() {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null); setInfo(null)
    const r = mode === 'in'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } })
    setBusy(false)
    if (r.error) return setError(errorText(r.error))
    if (mode === 'up' && !r.data.session) setInfo('Poslali sme ti e-mail. Potvrď ho a potom sa prihlás.')
  }

  return (
    <AuthCard title="Tipuj Premier League s kamošmi a zbieraj IQ body.">
      <Button
        variant="outline"
        className="h-11 w-full text-base"
        onClick={() => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin } })}
      >
        Pokračovať cez Google
      </Button>
      <p className="my-4 text-center text-sm text-neutral-500">alebo e-mailom</p>
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="password">Heslo</Label>
          <Input id="password" type="password" minLength={8} autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {info && <p className="text-sm text-green-800">{info}</p>}
        <Button type="submit" disabled={busy} className="h-11 w-full text-base">
          {mode === 'in' ? 'Prihlásiť sa' : 'Zaregistrovať sa'}
        </Button>
      </form>
      <button className="mt-4 w-full text-sm text-neutral-600 underline underline-offset-4"
        onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
        {mode === 'in' ? 'Ešte nemáš účet? Zaregistruj sa' : 'Už máš účet? Prihlás sa'}
      </button>
    </AuthCard>
  )
}
