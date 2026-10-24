import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { supabase } from './supabase'

type Res = { result: string; name?: string; category?: string; ticket_number?: string; used_at?: string }
const LOOK: Record<string, { label: string; sub: string; cls: string }> = {
  VALID: { label: 'VALID', sub: 'Admit the ticket-holder', cls: 'bg-green-600' },
  ALREADY_USED: { label: 'ALREADY USED', sub: 'Do not admit again', cls: 'bg-red-700' },
  INVALID: { label: 'INVALID', sub: 'Ticket not recognized', cls: 'bg-red-700' },
  PAYMENT_NOT_CONFIRMED: { label: 'PAYMENT NOT CONFIRMED', sub: 'Do not admit', cls: 'bg-red-700' },
  TICKET_ERROR: { label: 'EVENT OR TICKET ERROR', sub: 'Investigate / call organizer', cls: 'bg-orange-600' },
}

export default function Scanner() {
  const [res, setRes] = useState<Res | null>(null)
  const [camErr, setCamErr] = useState('')
  const [manual, setManual] = useState('')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false) // one scan at a time

  async function submit(args: { p_token?: string; p_number?: string }) {
    if (lock.current) return
    lock.current = true; setBusy(true)
    const { data, error } = await supabase.rpc('scan_ticket', args)
    setBusy(false)
    setRes(error || !data ? { result: 'TICKET_ERROR' } : (data as Res))
  }
  function onScan(text: string) {
    if (!text.startsWith('ABP1:')) return submit({ p_number: '' }) // not one of our QR codes -> INVALID
    submit({ p_token: text.slice(5) })
  }
  function next() { setRes(null); setManual(''); lock.current = false }

  useEffect(() => {
    const h = new Html5Qrcode('reader')
    h.start({ facingMode: 'environment' }, { fps: 10, qrbox: 240 }, onScan, () => {})
      .catch(() => setCamErr('Camera not available. Allow camera access (HTTPS required) or use manual entry below.'))
    return () => { h.stop().then(() => h.clear()).catch(() => {}) }
  }, [])

  const look = res ? (LOOK[res.result] ?? LOOK.TICKET_ERROR) : null
  return (
    <div className="mx-auto max-w-md p-4 space-y-4">
      <h1 className="font-display text-2xl text-gold">Entrance scanner</h1>
      <div id="reader" className="overflow-hidden rounded-xl bg-black" />
      {camErr && <p role="alert" className="text-red-400 text-sm">{camErr}</p>}
      {busy && <p>Checking…</p>}
      {res && look && (
        <div role="alert" className={`${look.cls} rounded-xl p-6 text-center text-white space-y-1`}>
          <p className="text-3xl font-black">{look.label}</p><p>{look.sub}</p>
          {res.ticket_number && <p className="text-sm">{res.ticket_number} · {res.category} · {res.name}</p>}
          {res.used_at && <p className="text-sm">Used at {new Date(res.used_at).toLocaleString()}</p>}
          <button onClick={next} className="mt-3 rounded-lg bg-white px-6 py-3 font-bold text-black">Scan next</button>
        </div>)}
      <div className="space-y-2 border-t border-lime/20 pt-4">
        <p className="text-sm text-zinc-400">Camera not working? Type the ticket number (e.g. ABP-1A2B3C4D-01):</p>
        <input className="w-full rounded-lg bg-black/40 border border-lime/20 px-4 py-3" value={manual} onChange={e => setManual(e.target.value)} placeholder="Ticket number" />
        <button disabled={!manual.trim() || !!res} onClick={() => submit({ p_number: manual })} className="w-full rounded-lg bg-lime py-3 font-bold text-ink disabled:opacity-40">Check ticket</button>
      </div>
    </div>)
}
