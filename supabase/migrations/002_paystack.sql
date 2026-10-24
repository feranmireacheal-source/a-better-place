-- Paystack payments: only the server (service_role) can mark a booking PAID.
alter table bookings add column if not exists paystack_reference text;
drop function if exists submit_payment_reference(text, text, text);

create or replace function mark_paid_by_gateway(p_booking_ref text, p_amount_kobo bigint, p_paystack_ref text)
returns int language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  select * into b from bookings where reference = p_booking_ref for update;
  if not found then raise exception 'Booking not found'; end if;
  if p_amount_kobo <> b.total_amount::bigint * 100 then raise exception 'Amount mismatch'; end if;
  if b.payment_status = 'PAID' then return (select count(*) from tickets where booking_id = b.id); end if; -- idempotent
  update bookings set payment_status='PAID', paystack_reference=p_paystack_ref, verified_at=now() where id = b.id;
  insert into tickets (booking_id, ticket_number, token, category)
  select b.id, b.reference || '-' || lpad(g::text, 2, '0'), encode(gen_random_bytes(24), 'hex'), b.category
  from generate_series(1, b.quantity) g;
  return b.quantity;
end $$;
revoke all on function mark_paid_by_gateway(text, bigint, text) from public, anon, authenticated;
grant execute on function mark_paid_by_gateway(text, bigint, text) to service_role;
