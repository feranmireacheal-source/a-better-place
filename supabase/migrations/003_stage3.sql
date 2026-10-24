-- Stage 3: email tracking, ticket scanning, admin ticket management
alter table bookings add column if not exists email_attempts int not null default 0;
alter table bookings add column if not exists email_updated_at timestamptz;
alter table bookings drop constraint if exists bookings_email_status_check;
alter table bookings add constraint bookings_email_status_check check (email_status in ('NOT_SENT','SENDING','SENT','FAILED'));

-- Email "claim": only one sender at a time; never re-sends once SENT. Returns attempt number, or NULL = nothing to do.
create function claim_email(p_booking uuid) returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update bookings set email_status='SENDING', email_attempts=email_attempts+1, email_updated_at=now()
  where id = p_booking and payment_status='PAID'
    and (email_status in ('NOT_SENT','FAILED') or (email_status='SENDING' and email_updated_at < now() - interval '5 minutes'))
  returning email_attempts into n;
  return n;
end $$;
create function finish_email(p_booking uuid, p_ok boolean, p_error text) returns void language sql security definer set search_path = public as $$
  update bookings set email_status = case when p_ok then 'SENT' else 'FAILED' end,
    email_error = case when p_ok then null else left(p_error, 300) end, email_updated_at = now() where id = p_booking
$$;
revoke all on function claim_email(uuid), finish_email(uuid, boolean, text) from public, anon, authenticated;
grant execute on function claim_email(uuid), finish_email(uuid, boolean, text) to service_role;

-- Staff scan: atomic (row lock), by QR token or by typed ticket number
create function scan_ticket(p_token text default null, p_number text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t tickets; b bookings; res text;
begin
  if not is_staff() then raise exception 'Not authorized'; end if;
  if p_token is null and p_number is null then return jsonb_build_object('result','INVALID'); end if;
  select * into t from tickets
   where (p_token is not null and token = p_token) or (p_token is null and ticket_number = upper(trim(p_number))) for update;
  if not found then
    insert into scans (staff_id, result) values (auth.uid(), 'INVALID');
    return jsonb_build_object('result','INVALID');
  end if;
  select * into b from bookings where id = t.booking_id;
  if b.payment_status <> 'PAID' then res := 'PAYMENT_NOT_CONFIRMED';
  elsif t.status = 'VOID' then res := 'TICKET_ERROR';
  elsif t.status = 'USED' then res := 'ALREADY_USED';
  else update tickets set status='USED', used_at=now(), used_by=auth.uid() where id = t.id; res := 'VALID';
  end if;
  insert into scans (ticket_id, staff_id, result) values (t.id, auth.uid(), res);
  return jsonb_build_object('result', res, 'ticket_number', t.ticket_number, 'category', t.category, 'name', b.full_name,
    'used_at', case when res = 'ALREADY_USED' then t.used_at end);
end $$;

create function void_ticket(p_ticket uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Not authorized'; end if;
  update tickets set status='VOID' where id = p_ticket and status = 'ISSUED';
end $$;
revoke all on function scan_ticket(text, text), void_ticket(uuid) from public, anon;
grant execute on function scan_ticket(text, text), void_ticket(uuid) to authenticated;
