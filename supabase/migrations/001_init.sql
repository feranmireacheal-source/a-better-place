-- A Better Place: schema, security, and server-side functions
create extension if not exists pgcrypto;

create table staff_roles (user_id uuid primary key references auth.users on delete cascade,
  role text not null check (role in ('admin','staff')), created_at timestamptz default now());

create table bookings (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,
  idempotency_key uuid unique,
  full_name text not null check (char_length(full_name) between 2 and 80),
  email text not null check (email ~* '^\S+@\S+\.\S+$'),
  phone text not null check (phone ~ '^[0-9+ -]{10,16}$'),
  category text not null check (category in ('REGULAR','PLUS1','VIP')),
  quantity int not null check (quantity between 1 and 10),
  unit_price int not null, total_amount int not null,
  payment_status text not null default 'PENDING' check (payment_status in ('PENDING','PAID','REJECTED')),
  payment_reference text, receipt_path text,
  verified_by uuid, verified_at timestamptz,
  email_status text not null default 'NOT_SENT' check (email_status in ('NOT_SENT','SENT','FAILED')),
  email_error text, created_at timestamptz default now());
create index on bookings (email); create index on bookings (phone); create index on bookings (payment_status);

create table tickets (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings on delete cascade,
  ticket_number text unique not null,
  token text unique not null,               -- random, unguessable; only this goes in the QR
  category text not null,
  status text not null default 'ISSUED' check (status in ('ISSUED','USED','VOID')),
  used_at timestamptz, used_by uuid, created_at timestamptz default now());
create index on tickets (booking_id);

create table scans (id bigserial primary key, ticket_id uuid references tickets, staff_id uuid,
  result text not null, scanned_at timestamptz default now());

-- Lock everything: no direct access for the public
alter table staff_roles enable row level security;
alter table bookings enable row level security;
alter table tickets enable row level security;
alter table scans enable row level security;

create function is_admin() returns boolean language sql security definer stable set search_path = public as
$$ select exists (select 1 from staff_roles where user_id = auth.uid() and role = 'admin') $$;
create function is_staff() returns boolean language sql security definer stable set search_path = public as
$$ select exists (select 1 from staff_roles where user_id = auth.uid()) $$;

create policy "admin reads bookings" on bookings for select using (is_admin());
create policy "admin reads tickets" on tickets for select using (is_admin());
create policy "admin reads scans" on scans for select using (is_staff());
create policy "own role" on staff_roles for select using (user_id = auth.uid());
-- No insert/update/delete policies: all writes happen through the functions below.

-- Public: create a PENDING booking. Price is decided HERE, never by the browser.
create function create_booking(p_name text, p_email text, p_phone text, p_category text, p_qty int, p_key uuid)
returns table (reference text, total_amount int) language plpgsql security definer set search_path = public as $$
declare v_price int; v_ref text; v_total int;
begin
  v_price := case p_category when 'REGULAR' then 3000 when 'PLUS1' then 5000 when 'VIP' then 30000 end;
  if v_price is null then raise exception 'Invalid category'; end if;
  if p_qty < 1 or p_qty > 10 then raise exception 'Invalid quantity'; end if;
  -- rate limit: max 5 bookings per email per hour
  if (select count(*) from bookings where lower(email)=lower(p_email) and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many requests'; end if;
  select b.reference, b.total_amount into v_ref, v_total from bookings b where idempotency_key = p_key;
  if found then return query select v_ref, v_total; return; end if;
  v_ref := 'ABP-' || upper(encode(gen_random_bytes(4), 'hex'));
  v_total := v_price * p_qty;
  insert into bookings (reference, idempotency_key, full_name, email, phone, category, quantity, unit_price, total_amount)
  values (v_ref, p_key, trim(p_name), trim(p_email), trim(p_phone), p_category, p_qty, v_price, v_total);
  return query select v_ref, v_total;
end $$;

-- Public: attach a transaction reference (a CLAIM only; never marks anything paid)
create function submit_payment_reference(p_reference text, p_email text, p_txref text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update bookings set payment_reference = left(trim(p_txref), 100)
  where reference = p_reference and lower(email) = lower(p_email) and payment_status = 'PENDING';
  if not found then raise exception 'Not found'; end if;
end $$;

-- Admin: confirm payment. Idempotent: row lock + only creates tickets once.
create function confirm_payment(p_booking uuid) returns int
language plpgsql security definer set search_path = public as $$
declare b bookings; n int;
begin
  if not is_admin() then raise exception 'Not authorized'; end if;
  select * into b from bookings where id = p_booking for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.payment_status = 'REJECTED' then raise exception 'Booking was rejected'; end if;
  if b.payment_status = 'PAID' then return (select count(*) from tickets where booking_id = b.id); end if;
  update bookings set payment_status='PAID', verified_by=auth.uid(), verified_at=now() where id = b.id;
  insert into tickets (booking_id, ticket_number, token, category)
  select b.id, b.reference || '-' || lpad(g::text, 2, '0'), encode(gen_random_bytes(24), 'hex'), b.category
  from generate_series(1, b.quantity) g;
  return b.quantity;
end $$;

create function reject_payment(p_booking uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Not authorized'; end if;
  update bookings set payment_status='REJECTED', verified_by=auth.uid(), verified_at=now()
  where id = p_booking and payment_status = 'PENDING';
end $$;

-- Staff: redeem a ticket atomically (row lock prevents two scanners admitting the same ticket)
create function redeem_ticket(p_token text) returns text
language plpgsql security definer set search_path = public as $$
declare t tickets; pay text; res text;
begin
  if not is_staff() then raise exception 'Not authorized'; end if;
  select * into t from tickets where token = p_token for update;
  if not found then insert into scans (staff_id, result) values (auth.uid(), 'INVALID'); return 'INVALID'; end if;
  select payment_status into pay from bookings where id = t.booking_id;
  if pay <> 'PAID' or t.status = 'VOID' then res := 'PAYMENT_NOT_CONFIRMED';
  elsif t.status = 'USED' then res := 'ALREADY_USED';
  else update tickets set status='USED', used_at=now(), used_by=auth.uid() where id = t.id; res := 'VALID';
  end if;
  insert into scans (ticket_id, staff_id, result) values (t.id, auth.uid(), res);
  return res;
end $$;

-- Lock down function access
revoke all on function create_booking, submit_payment_reference, confirm_payment, reject_payment, redeem_ticket from public;
grant execute on function create_booking, submit_payment_reference to anon, authenticated;
grant execute on function confirm_payment, reject_payment, redeem_ticket to authenticated;
-- After creating your admin user in Supabase Auth, run:
-- insert into staff_roles (user_id, role) values ('YOUR-USER-UUID', 'admin');
