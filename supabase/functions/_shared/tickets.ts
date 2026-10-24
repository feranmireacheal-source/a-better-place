import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1'
import QRCode from 'npm:qrcode@1.5.4'

export const serviceClient = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const clean = (s: string) => String(s).replace(/[^\x20-\x7E]/g, '?') // PDF standard fonts: ASCII only
const esc = (s: string) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const CAT: Record<string, string> = { REGULAR: 'Regular', PLUS1: 'Plus 1', VIP: 'VIP' }
const b64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode(...u.subarray(i, i + 8192)); return btoa(s) }

// One PDF per ticket. The QR holds only "ABP1:" + a random 48-hex token: no personal data.
export async function ticketPdf(t: { ticket_number: string; token: string; category: string }, holder: string, ref: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([420, 640])
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const reg = await pdf.embedFont(StandardFonts.Helvetica)
  const lime = rgb(0.71, 0.95, 0.23), gold = rgb(0.83, 0.69, 0.22), txt = rgb(0.9, 0.9, 0.9)
  page.drawRectangle({ x: 0, y: 0, width: 420, height: 640, color: rgb(0.02, 0.05, 0.03) })
  page.drawRectangle({ x: 0, y: 620, width: 420, height: 20, color: lime })
  const w = (s: string, y: number, size: number, font = reg, color = txt) => page.drawText(clean(s), { x: 30, y, size, font, color })
  w('A BETTER PLACE', 575, 30, bold, lime)
  w('ThebrainOriginal Films', 553, 12, reg, gold)
  w(`${CAT[t.category] ?? t.category} ticket`, 515, 22, bold)
  w(`Ticket holder: ${holder}`.slice(0, 48), 490, 11)
  w(`Ticket no: ${t.ticket_number}`, 472, 11, bold)
  w(`Booking ref: ${ref}`, 456, 11)
  w('25 November 2026', 428, 13, bold, gold)
  w('Red carpet: 4:00 PM   |   Screening: 8:00 PM', 410, 11)
  w('White House, Federal University Oye-Ekiti,', 392, 11)
  w('Ekiti State, Nigeria', 378, 11)
  const png = await QRCode.toBuffer('ABP1:' + t.token, { type: 'png', margin: 2, width: 480 })
  const img = await pdf.embedPng(new Uint8Array(png))
  page.drawRectangle({ x: 85, y: 108, width: 250, height: 250, color: rgb(1, 1, 1) })
  page.drawImage(img, { x: 85, y: 108, width: 250, height: 250 })
  w('ENTRY: show this QR code at the entrance. One scan = one entry.', 85, 9, bold)
  w('Do not share or post this ticket. Only the first scan is admitted.', 70, 9)
  return await pdf.save()
}

// Sends all of a booking's tickets by email. Safe to call repeatedly: the DB "claim" allows only one send per success.
export async function sendTicketEmail(sb: SupabaseClient, bookingId: string): Promise<{ status: string; detail?: string }> {
  const { data: attempt } = await sb.rpc('claim_email', { p_booking: bookingId })
  if (!attempt) return { status: 'SKIPPED', detail: 'Already sent, in progress, or booking not paid' }
  try {
    const { data: b, error } = await sb.from('bookings').select('*, tickets(*)').eq('id', bookingId).single()
    if (error || !b) throw new Error('Booking not found')
    const tickets = (b.tickets ?? []).filter((t: any) => t.status !== 'VOID').sort((a: any, c: any) => a.ticket_number.localeCompare(c.ticket_number))
    if (!tickets.length) throw new Error('No tickets for this booking')
    const attachments = []
    for (const t of tickets) attachments.push({ filename: `${t.ticket_number}.pdf`, content: b64(await ticketPdf(t, b.full_name, b.reference)) })
    const base = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ticket-pdf?t=`
    const links = tickets.map((t: any) => `<li><a href="${base}${t.token}" style="color:#4d7c0f">${esc(t.ticket_number)}</a></li>`).join('')
    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;background:#0b1a12;color:#e5e7eb;padding:28px;border-radius:12px">
      <h1 style="color:#b6f23a;margin:0">A Better Place</h1><p style="color:#d4af37;margin-top:4px">ThebrainOriginal Films</p>
      <p>Hello ${esc(b.full_name)}, your payment is confirmed. Your ${tickets.length} ${CAT[b.category] ?? b.category} ticket(s) are attached as PDFs, one QR code per ticket.</p>
      <p><b>Booking reference:</b> ${esc(b.reference)}<br><b>Date:</b> 25 November 2026<br><b>Red carpet:</b> 4:00 PM &nbsp; <b>Screening:</b> 8:00 PM<br>
      <b>Venue:</b> White House, Federal University Oye-Ekiti, Ekiti State, Nigeria</p>
      <p><b>Entry:</b> show each QR code at the entrance (printed or on your phone). Each ticket admits one person, once. Do not share your tickets.</p>
      <p>Ticket download links:</p><ul style="background:#fff;padding:12px 28px;border-radius:8px">${links}</ul></div>`
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json', 'Idempotency-Key': `abp-${bookingId}-${attempt}` },
      body: JSON.stringify({ from: Deno.env.get('EMAIL_FROM'), to: [b.email], subject: `Your tickets: A Better Place (${b.reference})`, html, attachments }),
    })
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`)
    await sb.rpc('finish_email', { p_booking: bookingId, p_ok: true, p_error: null })
    return { status: 'SENT' }
  } catch (e) {
    const m = (e as Error).message ?? String(e)
    await sb.rpc('finish_email', { p_booking: bookingId, p_ok: false, p_error: m })
    return { status: 'FAILED', detail: m }
  }
}

// Asks Paystack directly (never trusts the browser), checks amount/currency, then marks PAID (idempotent).
export async function verifyAndMark(sb: SupabaseClient, paystackRef: string): Promise<{ ok: boolean; bookingId?: string; reason?: string; fatal?: boolean }> {
  const v = await (await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(paystackRef)}`,
    { headers: { Authorization: `Bearer ${Deno.env.get('PAYSTACK_SECRET_KEY')}` } })).json()
  const d = v?.data
  if (!v.status || d?.status !== 'success' || d?.currency !== 'NGN' || !d?.metadata?.booking_reference) return { ok: false, reason: d?.status ?? 'not_verified' }
  const { error } = await sb.rpc('mark_paid_by_gateway', { p_booking_ref: d.metadata.booking_reference, p_amount_kobo: d.amount, p_paystack_ref: d.reference })
  if (error) return { ok: false, reason: error.message, fatal: true }
  const { data: b } = await sb.from('bookings').select('id').eq('reference', d.metadata.booking_reference).single()
  return { ok: true, bookingId: b?.id }
}
