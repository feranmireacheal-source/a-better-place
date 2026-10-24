# Testing (use Paystack TEST mode and a test Resend setup; nothing here has been run by the author)

Prep: all 3 migrations run, functions deployed, secrets set, an admin user created (see README). Open the site, `#/admin`, `#/scan`.

1. **Booking:** book 3 Regular tickets. Expect reference ABP-XXXXXXXX, redirect to Paystack. In Admin the booking is PENDING, 0 tickets, revenue unchanged.
2. **Price tampering:** in browser DevTools console, try `supabase.rpc('create_booking', ...)` with qty 99 -> rejected (limit 10). The total is always computed in the database.
3. **Pay:** pay with a Paystack test card. Expect: booking PAID, exactly 3 tickets (-01,-02,-03), email status SENT, email with 3 PDFs. Each PDF has a different QR.
4. **Idempotency:** in Paystack dashboard resend the webhook, and click "Send email" if shown. Still 3 tickets, no 2nd email (SKIPPED).
5. **Email failure/retry:** temporarily set a wrong RESEND_API_KEY, pay a new booking -> email FAILED with an error; fix the key, click "Retry email" -> SENT, tickets unchanged.
6. **Missed webhook:** on a PENDING booking you actually paid, click "Re-check with Paystack" -> becomes PAID.
7. **Scanner:** sign in at `#/scan`, scan a PDF's QR -> VALID. Scan again -> ALREADY USED. Type a fake number -> INVALID. Void a ticket in admin, scan it -> EVENT OR TICKET ERROR. Scan a ticket of an unpaid booking: none exist (not issued).
8. **Concurrency:** open `#/scan` on two phones, scan the same ticket at the same moment -> only one shows VALID.
9. **Access control:** signed out, `#/admin` shows the sign-in form; in the console `supabase.from('bookings').select()` returns nothing; `supabase.rpc('confirm_payment', ...)` and `scan_ticket` fail as anonymous. A staff (non-admin) account sees "not authorized" on `#/admin`.
10. **Ticket links:** open a ticket PDF link from the email; a link with one character changed returns 404.
