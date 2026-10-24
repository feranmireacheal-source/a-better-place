# A Better Place - Premiere Ticketing

## Build status (honest)
Written in this project (NOT yet tested by me against live Supabase, Paystack or Resend; follow TESTING.md):
- Public site + booking, server-side pricing, Paystack checkout, signed webhook + API verification
- One unique ticket + QR token per ticket, created only after verified payment
- PDF ticket per ticket (Edge Function `ticket-pdf`, also attached to the email)
- Email via Resend with duplicate protection and admin retry
- Admin dashboard at `#/admin` (orders, stats, search, re-check Paystack, retry email, reject, void ticket, PDF links)
- Staff scanner at `#/scan` (camera + manual ticket number; atomic, one entry per ticket)
Still to do: custom domain, live-mode go-live checks, load testing.

## Run locally on Windows (Command Prompt, not PowerShell)
Easiest: double-click `setup-windows.bat` once, edit `.env`, then double-click `run-dev.bat`.
Or by hand: press Windows key, type `cmd`, press Enter, then:
```
cd /d C:\Users\feran\Downloads\a-better-place-stage2-paystack\a-better-place
dir package.json
node -v
npm -v
npm install
copy .env.example .env
notepad .env
npm run dev
```
Open the http://localhost:5173 link shown. Stop the server with Ctrl+C.
If `dir package.json` says "File Not Found", you are in the wrong folder: package.json is inside the inner `a-better-place` folder.
PowerShell "running scripts is disabled": just use Command Prompt. (Or in PowerShell once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.)
Without real Supabase values in `.env` the site opens but shows a setup banner and booking is disabled.

## Supabase setup
1. Create a free project at https://supabase.com. Project Settings > API: copy the Project URL and anon public key into `.env`. Never use the service_role key there.
2. SQL Editor: run `supabase/migrations/001_init.sql`, then `002_paystack.sql`.
3. Replace `public/images` files with final artwork if needed.

## Paystack setup (replaces manual bank transfer)
1. Create a Paystack account (paystack.com) and complete business verification. Use TEST mode first.
2. Settings > API Keys: copy the TEST secret key (sk_test_...). Never put it in `.env` or the website code.
3. Install the Supabase CLI (https://supabase.com/docs/guides/cli), then in the project folder:
   ```
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase secrets set PAYSTACK_SECRET_KEY=sk_test_xxx SITE_URL=http://localhost:5173
   supabase functions deploy paystack-init
   supabase functions deploy paystack-webhook --no-verify-jwt
   ```
4. Run `supabase/migrations/002_paystack.sql` in the Supabase SQL Editor.
5. Paystack dashboard > Settings > API Keys & Webhooks > Webhook URL:
   `https://YOUR_PROJECT_REF.supabase.co/functions/v1/paystack-webhook`
6. Test with Paystack test cards, then switch to LIVE keys and set SITE_URL to your real site.
Fees are absorbed by you by default (prices shown are what you list). Ticket EMAIL is still Stage 3: after payment, tickets are created in the database but not yet emailed.

## Stage 3 setup (what YOU must do)
1. SQL Editor: run `003_stage3.sql` after 001 and 002.
2. Resend (https://resend.com): create an account and an API key. Sender: to email real customers you must verify a domain you own in Resend (add the DNS records it shows). Before that, as far as I know, Resend's test sender `onboarding@resend.dev` only delivers to your own account email: fine for testing only.
3. Secrets (Command Prompt, in the project folder):
```
supabase secrets set RESEND_API_KEY=re_xxx EMAIL_FROM="A Better Place <onboarding@resend.dev>"
```
4. Deploy all functions:
```
supabase functions deploy paystack-init
supabase functions deploy paystack-webhook --no-verify-jwt
supabase functions deploy ticket-pdf --no-verify-jwt
supabase functions deploy admin-actions
```
5. Create your admin: Supabase > Authentication > Users > Add user (email + password). Copy its UUID, then in SQL Editor:
```
insert into staff_roles (user_id, role) values ('THE-UUID', 'admin');
```
Create gate staff the same way with role `'staff'`. Staff can scan; only admins see the dashboard.
6. `npm install` (adds html5-qrcode), `npm run dev`. Dashboard: http://localhost:5173/#/admin  Scanner: http://localhost:5173/#/scan
7. Deploy: push to GitHub, create a Netlify site from it, add VITE_ variables in Netlify (Site settings > Environment variables), and set `SITE_URL` secret to the Netlify address. Camera scanning needs HTTPS (Netlify provides it; localhost also works). Custom domain: Netlify > Domain management.
Never put the Paystack secret, Resend key or service-role key in `.env` or frontend code.
Limits: the dashboard loads the latest 1000 bookings.
