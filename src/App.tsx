import { useEffect, useState } from 'react'
import { supabase, env, configured } from './supabase'

const TICKETS = [
  { id: 'REGULAR', name: 'Regular', price: 3000, note: 'General admission' },
  { id: 'PLUS1', name: 'Plus 1', price: 5000, note: 'Enhanced seating' },
  { id: 'VIP', name: 'VIP', price: 30000, note: 'Premium experience' },
]
const naira = (n: number) => '₦' + n.toLocaleString('en-NG')
const wa = (msg: string) => `https://wa.me/${env.VITE_WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`
const FAQ = [
  ['When will I get my tickets?', 'After your Paystack payment is confirmed, each ticket (with its own QR code) is issued automatically.'],
  ['How do I pay?', 'Securely on Paystack by card, bank transfer or USSD. We never see your card details.'],
  ['Does each ticket have its own QR?', 'Yes. Every ticket has a unique QR code and can be used once at the entrance.'],
]

function PaidTickets({ reference }: { reference: string }) {
  const [res, setRes] = useState<any>(null)
  const [gaveUp, setGaveUp] = useState(false)
  const [noKey, setNoKey] = useState(false)
  useEffect(() => {
    document.getElementById('tickets')?.scrollIntoView({ behavior: 'smooth' })
    let stop = false
    let key = ''
    try { key = localStorage.getItem('abp_key') || '' } catch { key = '' }
    if (!key) { setNoKey(true); return }
    async function check(n: number) {
      if (stop) return
      const { data } = await supabase.functions.invoke('my-tickets', { body: { key } })
      if (stop) return
      setRes(data)
      if (data?.status === 'PAID') return
      if (n >= 20) return setGaveUp(true)
      setTimeout(() => check(n + 1), 3000)
    }
    check(0)
    return () => { stop = true }
  }, [])
  const box = 'rounded-2xl border border-gold/40 bg-forest/80 p-6 space-y-3'
  const help = <a className="block text-sm underline" href={wa(`Hello, my booking reference is ${reference}.`)}>Need help? WhatsApp us</a>
  if (res?.status === 'PAID') return (
    <div className={box}>
      <h3 className="font-display text-2xl text-gold">Payment confirmed. Your tickets</h3>
      <p>Booking reference: <b className="text-lime">{res.reference}</b></p>
      {res.tickets.map((t: any) => (
        <div key={t.number} className="flex items-center justify-between rounded-lg bg-black/40 p-3">
          <span>{t.number} · {t.category}</span>
          <a className="rounded bg-lime px-4 py-2 font-semibold text-ink" href={t.url} target="_blank" rel="noreferrer">Download ticket</a>
        </div>))}
      <p className="text-sm text-zinc-400">Each ticket has its own QR code and admits one person, once. Save or screenshot your tickets and do not share them.</p>
      {help}
    </div>)
  if (noKey || gaveUp) return (
    <div className={box}>
      <h3 className="font-display text-2xl text-gold">We could not show your tickets here</h3>
      <p>Your booking reference is <b className="text-lime">{reference}</b>. If you paid, send us this reference on WhatsApp and we will confirm it. Please open this page in the same browser you booked from.</p>
      {help}
    </div>)
  return (
    <div className={box}>
      <h3 className="font-display text-2xl text-gold">Confirming your payment…</h3>
      <p>Please keep this page open. Your tickets appear here as soon as the payment is confirmed.</p>
      {help}
    </div>)
}

function Booking() {
  const [cat, setCat] = useState('REGULAR')
  const [qty, setQty] = useState(1)
  const [f, setF] = useState({ name: '', email: '', email2: '', phone: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState<{ ref: string; total: number } | null>(null)
  const [key] = useState(() => crypto.randomUUID()) // idempotency key: double-clicks create one booking
  const [seller, setSeller] = useState(() => { try { const r = new URLSearchParams(window.location.search).get('ref'); if (r) localStorage.setItem('abp_ref', r); return r || localStorage.getItem('abp_ref') || '' } catch { return '' } })
  const price = TICKETS.find(t => t.id === cat)!.price

  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy) return
    setErr('')
    if (!configured) return setErr('Site not configured yet: add your Supabase URL and anon key to the .env file, then restart.')
    if (f.name.trim().length < 2) return setErr('Enter your full name.')
    if (!/^\S+@\S+\.\S+$/.test(f.email)) return setErr('Enter a valid email.')
    if (f.email.trim().toLowerCase() !== f.email2.trim().toLowerCase()) return setErr('The two email addresses do not match. Please check them carefully, because your tickets are sent there.')
    if (!/^[0-9+\s-]{10,16}$/.test(f.phone)) return setErr('Enter a valid phone number.')
    setBusy(true)
    const { data, error } = await supabase.rpc('create_booking', {
      p_name: f.name, p_email: f.email, p_phone: f.phone, p_category: cat, p_qty: qty, p_key: key, p_seller: seller || null })
    setBusy(false)
    if (error || !data?.[0]) return setErr('Could not create booking. Please try again or contact us on WhatsApp.')
    try { localStorage.setItem('abp_key', key) } catch { /* ignore */ }
    setDone({ ref: data[0].reference, total: data[0].total_amount })
    pay(data[0].reference, f.email)
  }
  async function pay(ref: string, email: string) {
    setErr(''); setBusy(true)
    const { data, error } = await supabase.functions.invoke('paystack-init', { body: { reference: ref, email } })
    setBusy(false)
    if (error || !data?.url) return setErr('Could not open payment page. Tap "Pay now" to try again, or WhatsApp us.')
    window.location.href = data.url
  }
  const inp = 'w-full rounded-lg bg-black/40 border border-lime/20 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-lime'

  const paidRef = new URLSearchParams(window.location.search).get('paid')
  if (paidRef) return <PaidTickets reference={paidRef} />

  if (done) return (
    <div className="rounded-2xl border border-gold/40 bg-forest/80 p-6 space-y-4">
      <h3 className="font-display text-2xl text-gold">Booking created</h3>
      <p>Reference: <b className="text-lime text-xl">{done.ref}</b> · Amount: <b>{naira(done.total)}</b></p>
      <p className="text-sm text-zinc-400">Opening secure Paystack checkout… Your tickets are not valid until payment is confirmed.</p>
      {err && <p role="alert" className="text-red-400">{err}</p>}
      <button disabled={busy} onClick={() => pay(done.ref, f.email)} className="rounded-lg bg-lime px-5 py-3 font-semibold text-ink disabled:opacity-50">Pay now</button>
      <a className="block text-sm underline" href={wa(`Hello, my booking reference is ${done.ref}.`)}>Need help? WhatsApp us</a>
    </div>)

  return (
    <form onSubmit={submit} className="space-y-4">
      <input className={inp} placeholder="Full name" value={f.name} maxLength={80} onChange={e => setF({ ...f, name: e.target.value })} />
      <input className={inp} type="email" placeholder="Email address" value={f.email} maxLength={120} onChange={e => setF({ ...f, email: e.target.value })} />
      <input className={inp} type="email" placeholder="Confirm email address (type it again)" value={f.email2} maxLength={120} onPaste={e => e.preventDefault()} onChange={e => setF({ ...f, email2: e.target.value })} />
      <input className={inp} type="tel" placeholder="Phone number" value={f.phone} maxLength={16} onChange={e => setF({ ...f, phone: e.target.value })} />
      <div className="grid grid-cols-2 gap-3">
        <select aria-label="Ticket category" className={inp} value={cat} onChange={e => setCat(e.target.value)}>
          {TICKETS.map(t => <option key={t.id} value={t.id}>{t.name} – {naira(t.price)}</option>)}</select>
        <input aria-label="Quantity" className={inp} type="number" min={1}  value={qty}
          onChange={e => setQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
      </div>
      <input className={inp} placeholder="Seller code (optional)" value={seller} maxLength={30} onChange={e => setSeller(e.target.value)} />
      <p className="text-lg">Estimated total: <b className="text-gold">{naira(price * qty)}</b>
        <span className="text-xs text-zinc-500"> (a small Paystack processing fee is added at checkout)</span></p>
      {err && <p role="alert" className="text-red-400">{err}</p>}
      <button disabled={busy} className="w-full rounded-lg bg-lime px-6 py-4 font-bold text-ink disabled:opacity-50">{busy ? 'Please wait…' : 'Book and pay'}</button>
    </form>)
}

export default function App() {
  return (
    <main>
      {!configured && <div role="alert" className="bg-gold/20 px-6 py-3 text-center text-sm text-gold">Setup needed: open the .env file and add your Supabase URL and anon key, then restart npm run dev. Booking is disabled until then.</div>}
      <section className="relative mx-auto grid max-w-6xl gap-10 px-6 py-20 md:grid-cols-2 md:items-center rise">
        <div>
          <p className="tracking-[.3em] text-gold text-sm uppercase">The Brain Original presents</p>
          <h1 className="mt-3"><img src="/images/logo.png" alt="A Better Place" className="w-full max-w-md" /></h1>
          <p className="mt-5 text-lg text-zinc-300">A magical-realist romance about trauma, courage, safety, survival, and love. Charles, a poor student in 2025, falls into a sacred tree and meets Atirola, a student from 1996.</p>
          <a href="#tickets" className="mt-8 inline-block rounded-full bg-lime px-8 py-4 font-bold text-ink">Get Your Tickets</a>
        </div>
        <img src="/images/poster.jpg" alt="A Better Place movie poster" className="aspect-[4/5] w-full rounded-2xl border border-gold/40 bg-forest object-cover" />
      </section>

      <section className="mx-auto max-w-4xl px-6 py-12">
        <h2 className="font-display text-3xl text-gold mb-6">Watch the Trailer</h2>
        <div className="aspect-video w-full overflow-hidden rounded-2xl border border-gold/30 bg-black">
          <iframe className="h-full w-full" src="https://www.youtube-nocookie.com/embed/kdCJEfpfNgs" title="A Better Place trailer" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-12">
        <h2 className="font-display text-3xl text-gold mb-4">The Story</h2>
        <p>Charles, a poor University of Ibadan student in 2025, escapes bullies by falling into a sacred tree. Inside, he discovers a hidden sanctuary and meets Atirola, a student from 1996 who fled an attempted assault. Seven other survivors from Africa shelter there.</p>
        <p className="mt-4">Together, they uncover the tree's secrets and discover that it is Iyawo, a woman forced into marriage who surrendered her humanity to protect helpless people.</p>
        <p className="mt-4">The survivors must decide whether to return to their original worlds or remain in the sanctuary forever. Charles and Atirola have fallen in love, but leaving means losing one another across 29 years.</p>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-12 grid gap-4 sm:grid-cols-3 text-center">
        {[['Date', '25 November 2026'], ['Red carpet', '4:00 PM'], ['Screening', '8:00 PM']].map(([a, b]) =>
          <div key={a} className="rounded-xl border border-lime/20 bg-forest/60 p-5"><p className="text-xs uppercase text-gold">{a}</p><p className="text-xl mt-1">{b}</p></div>)}
        <p className="sm:col-span-3 text-zinc-300">Venue: White House, Federal University Oye-Ekiti, Ekiti State, Nigeria</p>
      </section>

      <section id="tickets" className="mx-auto max-w-5xl px-6 py-12">
        <h2 className="font-display text-3xl text-gold mb-6">Tickets</h2>
        <div className="grid gap-4 sm:grid-cols-3 mb-10">
          {TICKETS.map(t => <div key={t.id} className="rounded-2xl border border-gold/30 bg-forest/70 p-6 text-center">
            <p className="text-lime text-xl font-display">{t.name}</p><p className="text-3xl my-2">{naira(t.price)}</p><p className="text-sm text-zinc-400">{t.note}</p></div>)}
        </div>
        <div className="max-w-xl mx-auto"><Booking /></div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-12">
        <h2 className="font-display text-3xl text-gold mb-4">FAQ</h2>
        {FAQ.map(([q, a]) => <details key={q} className="border-b border-lime/20 py-3"><summary className="cursor-pointer">{q}</summary><p className="mt-2 text-zinc-400">{a}</p></details>)}
        <a className="mt-6 inline-block rounded-full border border-lime px-6 py-3 text-lime" href={wa('Hello, I need help with A Better Place tickets.')}>Chat on WhatsApp</a>
      </section>

      <footer className="border-t border-lime/10 py-8 text-center text-sm text-zinc-500">
        A ThebrainOriginal Films production · Written by Blessing Toria · Story by Oparinde Caleb
      </footer>
    </main>)
}
