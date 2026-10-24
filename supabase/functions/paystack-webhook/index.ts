// Paystack -> us. Signature check, API re-verification, amount check, then tickets + email.
import { serviceClient, verifyAndMark, sendTicketEmail } from '../_shared/tickets.ts'
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')
Deno.serve(async (req) => {
  const raw = await req.text()
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(Deno.env.get('PAYSTACK_SECRET_KEY')!), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign'])
  const sig = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)))
  if (sig !== req.headers.get('x-paystack-signature')) return new Response('bad signature', { status: 401 })
  const event = JSON.parse(raw)
  if (event.event !== 'charge.success') return new Response('ignored', { status: 200 })
  const sb = serviceClient()
  const r = await verifyAndMark(sb, event.data.reference)
  if (r.fatal) { console.error(r.reason); return new Response('error', { status: 500 }) } // Paystack retries
  if (r.ok && r.bookingId) console.log('email', await sendTicketEmail(sb, r.bookingId)) // failure is recorded in DB; admin can retry
  return new Response('ok', { status: 200 })
})
