import { useState } from 'react'
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

function Booking() {
  const [cat, setCat] = useState('REGULAR')
  const [qty, setQty] = useState(1)
  const [f, setF] = useState({ name: '', email: '', phone: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState<{ ref: string; total: number } | null>(null)
  const [key] = useState(() => crypto.randomUUID()) // idempotency key: double-clicks create one booking
  const price = TICKETS.find(t => t.id === cat)!.price

  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy) return
    setErr('')
    if (!configured) return setErr('Site not configured yet: add your Supabase URL and anon key to the .env file, then restart.')
    if (f.name.trim().length < 2) return setErr('Enter your full name.')
    if (!/^\S+@\S+\.\S+$/.test(f.email)) return setErr('Enter a valid email.')
    if (!/^[0-9+\s-]{10,16}$/.test(f.phone)) return setErr('Enter a valid phone number.')
    setBusy(true)
    const { data, error } = await supabase.rpc('create_booking', {
      p_name: f.name, p_email: f.email, p_phone: f.phone, p_category: cat, p_qty: qty, p_key: key })
    setBusy(false)
    if (error || !data?.[0]) return setErr('Could not create booking. Please try again or contact us on WhatsApp.')
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
  if (paidRef) return (
    <div className="rounded-2xl border border-gold/40 bg-forest/80 p-6 space-y-3">
      <h3 className="font-display text-2xl text-gold">Thank you!</h3>
      <p>If your payment went through, we are confirming it now. Your booking reference is <b className="text-lime">{paidRef}</b>.</p>
      <p className="text-sm text-zinc-400">Tickets are issued only after Paystack confirms the payment to our server.</p>
      <a className="block text-sm underline" href={wa(`Hello, my booking reference is ${paidRef}.`)}>Need help? WhatsApp us</a>
    </div>)

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
      <input className={inp} type="tel" placeholder="Phone number" value={f.phone} maxLength={16} onChange={e => setF({ ...f, phone: e.target.value })} />
      <div className="grid grid-cols-2 gap-3">
        <select aria-label="Ticket category" className={inp} value={cat} onChange={e => setCat(e.target.value)}>
          {TICKETS.map(t => <option key={t.id} value={t.id}>{t.name} – {naira(t.price)}</option>)}</select>
        <input aria-label="Quantity" className={inp} type="number" min={1} max={10} value={qty}
          onChange={e => setQty(Math.min(10, Math.max(1, Number(e.target.value) || 1)))} />
      </div>
      <p className="text-lg">Estimated total: <b className="text-gold">{naira(price * qty)}</b>
        <span className="text-xs text-zinc-500"> (final amount is calculated by our server)</span></p>
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
          <p className="tracking-[.3em] text-gold text-sm uppercase">ThebrainOriginal Films presents</p>
          <h1 className="font-display text-6xl md:text-7xl text-lime mt-3">A Better Place</h1>
          <p className="mt-5 text-lg text-zinc-300">A magical-realist romance about trauma, courage, safety, survival, and love. Charles, a poor student in 2025, falls into a sacred tree and meets Atirola, a student from 1996.</p>
          <a href="#tickets" className="mt-8 inline-block rounded-full bg-lime px-8 py-4 font-bold text-ink">Get Your Tickets</a>
        </div>
        {/* Put your real poster at public/images/poster.jpg */}
        <img src="/images/poster.jpg" alt="A Better Place movie poster" className="aspect-[4/5] w-full rounded-2xl border border-gold/40 bg-forest object-cover" />
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

      <section className="mx-auto max-w-5xl px-6 py-12">
        <h2 className="font-display text-3xl text-gold mb-6">Gallery</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <img src="/images/still-1.jpg" alt="Still from A Better Place" loading="lazy" className="w-full rounded-2xl border border-gold/30 object-cover" />
          <img src="/images/poster.jpg" alt="A Better Place poster" loading="lazy" className="w-full rounded-2xl border border-gold/30 object-cover" />
        </div>
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
