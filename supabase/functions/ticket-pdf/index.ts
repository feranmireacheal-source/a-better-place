// GET ?t=<48-hex ticket token> -> that one ticket as PDF. Only for PAID, non-void tickets.
import { serviceClient, ticketPdf } from '../_shared/tickets.ts'
Deno.serve(async (req) => {
  const t = new URL(req.url).searchParams.get('t') ?? ''
  if (!/^[0-9a-f]{48}$/.test(t)) return new Response('Not found', { status: 404 })
  const { data } = await serviceClient().from('tickets').select('*, bookings(full_name, reference, payment_status)').eq('token', t).maybeSingle()
  if (!data || data.bookings?.payment_status !== 'PAID' || data.status === 'VOID') return new Response('Not found', { status: 404 })
  const pdf = await ticketPdf(data, data.bookings.full_name, data.bookings.reference)
  return new Response(pdf, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${data.ticket_number}.pdf"` } })
})
