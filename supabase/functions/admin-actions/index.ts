// Admin-only: re-verify a payment with Paystack, or retry the ticket email. Checks the caller is an admin IN THE DATABASE.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { serviceClient, verifyAndMark, sendTicketEmail } from '../_shared/tickets.ts'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
  const userSb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
  const { data: isAdmin } = await userSb.rpc('is_admin')
  if (isAdmin !== true) return json({ error: 'Not authorized' }, 403)
  try {
    const { action, booking_id } = await req.json()
    const sb = serviceClient()
    if (action === 'resend') return json(await sendTicketEmail(sb, booking_id))
    if (action === 'verify') {
      const { data: b } = await sb.from('bookings').select('paystack_reference').eq('id', booking_id).single()
      if (!b?.paystack_reference) return json({ status: 'NO_PAYMENT_ATTEMPT' })
      const r = await verifyAndMark(sb, b.paystack_reference)
      if (!r.ok) return json({ status: 'NOT_PAID', detail: r.reason })
      return json({ status: 'PAID', email: await sendTicketEmail(sb, booking_id) })
    }
    return json({ error: 'Unknown action' }, 400)
  } catch { return json({ error: 'Bad request' }, 400) }
})
