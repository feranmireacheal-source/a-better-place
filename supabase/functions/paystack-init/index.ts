// Starts a Paystack checkout. The amount comes from the database, never from the browser.
import { createClient } from 'npm:@supabase/supabase-js@2'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
  try {
    const { reference, email } = await req.json()
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: b } = await sb.from('bookings').select('*').eq('reference', String(reference)).ilike('email', String(email)).maybeSingle()
    if (!b || b.payment_status !== 'PENDING') return json({ error: 'Booking not payable' }, 400)
    const payRef = `${b.reference}-${Date.now()}`
    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('PAYSTACK_SECRET_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: b.email, amount: b.total_amount * 100, currency: 'NGN',
        reference: payRef, // unique per attempt, so retries work
        callback_url: `${Deno.env.get('SITE_URL')}/?paid=${b.reference}`,
        metadata: { booking_reference: b.reference },
      }),
    })
    const out = await res.json()
    if (!out.status) return json({ error: 'Could not start payment' }, 502)
    await sb.from('bookings').update({ paystack_reference: payRef }).eq('id', b.id) // lets admins re-verify later
    return json({ url: out.data.authorization_url })
  } catch { return json({ error: 'Bad request' }, 400) }
})
