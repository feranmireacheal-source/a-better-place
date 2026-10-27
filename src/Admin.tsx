import { useEffect, useMemo, useState } from 'react'
import { supabase, env } from './supabase'

type B = any
const naira = (n: number) => '₦' + n.toLocaleString('en-NG')
const badge: Record<string, string> = { PAID: 'bg-lime/20 text-lime', PENDING: 'bg-gold/20 text-gold', REJECTED: 'bg-red-500/20 text-red-400' }
const CATS = ['REGULAR', 'PLUS1', 'VIP']

export default function Admin() {
  const [rows, setRows] = useState<B[]>([])
  const [q, setQ] = useState('')
  const [st, setSt] = useState('ALL')
  const [sel, setSel] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const { data, error } = await supabase.from('bookings').select('*, tickets(*)').order('created_at', { ascending: false }).limit(1000)
    if (error) setMsg('Could not load: ' + error.message); else setRows(data ?? [])
  }
  useEffect(() => { load() }, [])

  const s = useMemo(() => {
    const paid = rows.filter(r => r.payment_status === 'PAID')
    const tix = paid.flatMap(r => r.tickets ?? []).filter((t: B) => t.status !== 'VOID')
    return {
      total: rows.length, pending: rows.filter(r => r.payment_status === 'PENDING').length, paid: paid.length,
      rejected: rows.filter(r => r.payment_status === 'REJECTED').length, sold: tix.length,
      revenue: paid.reduce((a, r) => a + r.total_amount, 0), used: tix.filter((t: B) => t.status === 'USED').length,
      emailFail: paid.filter(r => r.email_status === 'FAILED').length,
      byCat: Object.fromEntries(CATS.map(c => [c, tix.filter((t: B) => t.category === c).length])),
    }
  }, [rows])

  const bySeller = useMemo(() => {
    const m: Record<string, { tickets: number; bookings: number }> = {}
    rows.filter(r => r.payment_status === 'PAID').forEach(r => {
      const k = r.seller || 'NO SELLER'
      const n = (r.tickets ?? []).filter((t: B) => t.status !== 'VOID').length
      m[k] = m[k] || { tickets: 0, bookings: 0 }
      m[k].tickets += n; m[k].bookings += 1
    })
    return Object.entries(m).sort((a, b) => b[1].tickets - a[1].tickets)
  }, [rows])
  function downloadSellers() {
    const csv = 'Seller,Paid tickets,Paid bookings\n' + bySeller.map(([n, v]) => `${n},${v.tickets},${v.bookings}`).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = 'tickets-by-seller.csv'; a.click()
  }

  const k = q.trim().toLowerCase()
  const shown = rows.filter(r => (st === 'ALL' || r.payment_status === st || (st === 'EMAIL_FAILED' && r.email_status === 'FAILED')) &&
    (!k || [r.reference, r.full_name, r.email, r.phone].some((v: string) => v.toLowerCase().includes(k))))
  const cur = rows.find(r => r.id === sel)

  async function act(action: 'verify' | 'resend', id: string) {
    setBusy(true); setMsg('')
    const { data, error } = await supabase.functions.invoke('admin-actions', { body: { action, booking_id: id } })
    setBusy(false)
    setMsg(error ? 'Action failed: ' + error.message : 'Result: ' + JSON.stringify(data))
    load()
  }
  async function simple(fn: string, args: object) {
    setBusy(true); setMsg('')
    const { error } = await supabase.rpc(fn, args)
    setBusy(false); setMsg(error ? 'Failed: ' + error.message : 'Done.'); load()
  }
  const card = (l: string, v: string | number) => <div key={l} className="rounded-xl border border-lime/20 bg-forest/70 p-3"><p className="text-xs text-zinc-400">{l}</p><p className="text-xl">{v}</p></div>

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <h1 className="font-display text-3xl text-gold">Admin dashboard</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {card('Total bookings', s.total)}{card('Pending payments', s.pending)}{card('Confirmed (paid)', s.paid)}{card('Rejected', s.rejected)}
        {card('Tickets sold (paid)', s.sold)}{card('Revenue (paid only)', naira(s.revenue))}{card('Tickets redeemed', s.used)}{card('Email failures', s.emailFail)}
        {CATS.map(c => card(`${c} tickets`, s.byCat[c]))}
      </div>
      <div className="rounded-xl border border-lime/20 bg-forest/70 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg text-gold">Tickets sold by seller (paid bookings only)</h2>
          <button onClick={downloadSellers} className="rounded border border-lime px-3 py-1 text-sm text-lime">Download CSV</button>
        </div>
        <table className="w-full text-left text-sm"><thead><tr><th className="py-1">Seller</th><th>Paid tickets</th><th>Paid bookings</th></tr></thead>
          <tbody>{bySeller.map(([n, v]) => <tr key={n} className="border-t border-lime/10"><td className="py-1">{n}</td><td>{v.tickets}</td><td>{v.bookings}</td></tr>)}
            {!bySeller.length && <tr><td colSpan={3} className="py-2 text-zinc-500">No paid bookings yet.</td></tr>}</tbody></table>
      </div>
      <div className="flex flex-wrap gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search reference, name, email, phone" className="min-w-[240px] flex-1 rounded-lg bg-black/40 border border-lime/20 px-3 py-2" />
        <select value={st} onChange={e => setSt(e.target.value)} className="rounded-lg bg-black/40 border border-lime/20 px-3 py-2">
          {['ALL', 'PAID', 'PENDING', 'REJECTED', 'EMAIL_FAILED'].map(o => <option key={o}>{o}</option>)}</select>
        <button onClick={load} className="rounded-lg border border-lime px-4 py-2 text-lime">Refresh</button>
      </div>
      {msg && <p role="status" className="text-gold break-words">{msg}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="max-h-[70vh] overflow-auto rounded-xl border border-lime/20">
          <table className="w-full text-left text-sm"><thead className="sticky top-0 bg-forest"><tr><th className="p-2">Ref</th><th>Name</th><th>Qty</th><th>Total</th><th>Status</th></tr></thead>
            <tbody>{shown.map(r => (
              <tr key={r.id} onClick={() => setSel(r.id)} className={`cursor-pointer border-t border-lime/10 hover:bg-lime/10 ${sel === r.id ? 'bg-lime/10' : ''}`}>
                <td className="p-2">{r.reference}</td><td>{r.full_name}</td><td>{r.quantity} {r.category}</td><td>{naira(r.total_amount)}</td>
                <td><span className={`rounded px-2 py-0.5 text-xs ${badge[r.payment_status]}`}>{r.payment_status}</span></td></tr>))}
              {!shown.length && <tr><td colSpan={5} className="p-4 text-zinc-500">No bookings.</td></tr>}</tbody></table>
        </div>
        {cur && (
          <div className="space-y-2 rounded-xl border border-gold/30 bg-forest/70 p-4 text-sm">
            <h2 className="text-lg text-lime">{cur.reference} · {cur.payment_status}</h2>
            <p>{cur.full_name} · {cur.email} · {cur.phone}</p>
            <p>Seller: {cur.seller || 'none'}</p>
            <p>{cur.quantity} × {cur.category} @ {naira(cur.unit_price)} = <b>{naira(cur.total_amount)}</b></p>
            <p>Paystack ref: {cur.paystack_reference ?? 'none (never opened checkout)'}</p>
            <p>Payment verified at: {cur.verified_at ? new Date(cur.verified_at).toLocaleString() : 'not verified'}</p>
            <p>Email: {cur.email_status} (attempts: {cur.email_attempts}){cur.email_error ? ' · ' + cur.email_error : ''}</p>
            <div className="flex flex-wrap gap-2">
              {cur.payment_status === 'PENDING' && <button disabled={busy} onClick={() => act('verify', cur.id)} className="rounded bg-lime px-3 py-2 font-semibold text-ink disabled:opacity-50">Re-check with Paystack</button>}
              {cur.payment_status === 'PENDING' && <button disabled={busy} onClick={() => confirm('Reject this booking?') && simple('reject_payment', { p_booking: cur.id })} className="rounded border border-red-400 px-3 py-2 text-red-400">Reject</button>}
              {cur.payment_status === 'PAID' && cur.email_status !== 'SENT' && <button disabled={busy} onClick={() => act('resend', cur.id)} className="rounded bg-lime px-3 py-2 font-semibold text-ink disabled:opacity-50">{cur.email_status === 'FAILED' ? 'Retry email' : 'Send email'}</button>}
            </div>
            <h3 className="pt-2 text-gold">Tickets</h3>
            {(cur.tickets ?? []).length === 0 && <p className="text-zinc-500">No tickets (issued only after verified payment).</p>}
            {(cur.tickets ?? []).sort((a: B, b: B) => a.ticket_number.localeCompare(b.ticket_number)).map((t: B) => (
              <div key={t.id} className="flex items-center justify-between border-t border-lime/10 py-1">
                <span>{t.ticket_number} · {t.status}{t.used_at ? ' ' + new Date(t.used_at).toLocaleTimeString() : ''}</span>
                <span className="space-x-3">
                  {t.status !== 'VOID' && <a className="underline text-lime" target="_blank" rel="noreferrer" href={`${env.VITE_SUPABASE_URL}/functions/v1/ticket-pdf?t=${t.token}`}>PDF</a>}
                  {t.status === 'ISSUED' && <button className="underline text-red-400" onClick={() => confirm('Void this ticket?') && simple('void_ticket', { p_ticket: t.id })}>Void</button>}
                </span></div>))}
          </div>)}
      </div>
    </div>)
}
