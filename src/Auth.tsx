import { useEffect, useState, ReactNode } from 'react'
import { supabase, configured } from './supabase'

// Sign-in gate. The REAL permission check happens in the database; this only decides what to show.
export default function Auth({ role, children }: { role: 'admin' | 'staff'; children: ReactNode }) {
  const [state, setState] = useState<'loading' | 'out' | 'denied' | 'ok'>('loading')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')

  async function check() {
    if (!configured) return setState('out')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return setState('out')
    const { data } = await supabase.rpc(role === 'admin' ? 'is_admin' : 'is_staff')
    setState(data === true ? 'ok' : 'denied')
  }
  useEffect(() => { check() }, [])
  async function login(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw })
    if (error) return setErr('Wrong email or password.')
    check()
  }
  async function out() { await supabase.auth.signOut(); setState('out') }
  const inp = 'w-full rounded-lg bg-black/40 border border-lime/20 px-4 py-3'

  if (state === 'loading') return <p className="p-8">Loading…</p>
  if (state === 'ok') return (
    <div>
      <div className="flex items-center justify-between border-b border-lime/20 px-4 py-2 text-sm">
        <a href="#/" className="text-lime">A Better Place</a>
        <button onClick={out} className="underline">Sign out</button>
      </div>{children}
    </div>)
  return (
    <form onSubmit={login} className="mx-auto mt-16 max-w-sm space-y-4 p-6">
      <h1 className="font-display text-2xl text-gold">{role === 'admin' ? 'Admin' : 'Staff'} sign in</h1>
      {!configured && <p className="text-red-400">Supabase is not configured in .env.</p>}
      {state === 'denied' && <p role="alert" className="text-red-400">This account is not authorized for this page.</p>}
      <input className={inp} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
      <input className={inp} type="password" placeholder="Password" value={pw} onChange={e => setPw(e.target.value)} />
      {err && <p role="alert" className="text-red-400">{err}</p>}
      <button className="w-full rounded-lg bg-lime py-3 font-bold text-ink">Sign in</button>
      {state === 'denied' && <button type="button" onClick={out} className="underline text-sm">Use a different account</button>}
    </form>)
}
