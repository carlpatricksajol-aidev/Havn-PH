-- What a paid plan changes in conversations.
--   Free:  a Keeper can answer 5 new renters each calendar month (Manila time). A renter's mobile number shows
--          to the Keeper once the Keeper has answered that renter.
--   Paid (Basic, Verified, Premium, while the term runs): no limit, the renter's number shows at once, and
--          signed-in renters get Call and Text buttons with the Keeper's number on the listing.
-- Admins are never limited.

create or replace function public.free_reply_limit() returns int language sql immutable as $$ select 5 $$;

-- Is this listing on a paid plan today?
create or replace function public.plan_on(lid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select plan is not null and plan_until is not null and plan_until >= (now() at time zone 'Asia/Manila')::date
                   from public.listings where id = lid), false)
$$;

-- How many new renters this Keeper has answered this month on listings without a plan.
create or replace function public.free_replies_used(keeper uuid) returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from (
    select m.inquiry_id
    from public.inquiry_messages m
    join public.inquiries q on q.id = m.inquiry_id
    join public.listings l on l.id = q.listing_id
    where m.sender_role = 'keeper' and l.owner_id = keeper and not public.plan_on(l.id)
    group by m.inquiry_id
    having min(m.created_at) >= (date_trunc('month', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila')
  ) x
$$;
revoke execute on function public.free_replies_used(uuid) from public, anon, authenticated;

-- For the signed-in Keeper: the limit and how much of it is used.
create or replace function public.keeper_quota() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('limit', public.free_reply_limit(), 'used', public.free_replies_used(auth.uid()))
$$;
grant execute on function public.keeper_quota() to authenticated;

-- The messages renters sent about the signed-in Keeper's listings. The renter's mobile and email are left out
-- until the Keeper has answered (or the listing is on a plan); the team's own notes are never included.
create or replace function public.keeper_inquiries() returns setof jsonb language sql stable security definer set search_path = public as $$
  select (to_jsonb(q) - 'admin_note' - 'status')
      || jsonb_build_object(
           'renter_mobile', case when s.paid or s.answered then q.renter_mobile end,
           'renter_email',  case when s.paid or s.answered then q.renter_email end,
           'paid', s.paid, 'answered', s.answered,
           'locked', not s.paid and not s.answered and public.free_replies_used(auth.uid()) >= public.free_reply_limit())
  from public.inquiries q
  join public.listings l on l.id = q.listing_id and l.owner_id = auth.uid()
  cross join lateral (select public.plan_on(l.id) as paid,
                             exists (select 1 from public.inquiry_messages m where m.inquiry_id = q.id and m.sender_role = 'keeper') as answered) s
  order by q.created_at desc
  limit 200
$$;
grant execute on function public.keeper_inquiries() to authenticated;

-- Keepers no longer read the inquiries table directly (that showed every renter's number); admins still do,
-- and renters still read what they sent ("inquiries: renter reads own").
drop policy if exists "inquiries: landlord or admin reads" on public.inquiries;
drop policy if exists "inquiries: admin reads" on public.inquiries;
create policy "inquiries: admin reads" on public.inquiries for select using (public.is_admin());

-- Replies: flood protection as before, plus the Free limit on answering new renters.
create or replace function public.limit_replies() returns trigger language plpgsql security definer set search_path = public as $$
declare
  lid uuid; keeper uuid;
begin
  if (select count(*) from public.inquiry_messages where sender_id = auth.uid() and created_at > now() - interval '1 hour') >= 40 then
    raise exception 'Too many messages. Please wait a little and try again.';
  end if;
  if new.sender_role = 'keeper' and not public.is_admin() then
    select l.id, l.owner_id into lid, keeper from public.inquiries q join public.listings l on l.id = q.listing_id where q.id = new.inquiry_id;
    if lid is not null and not public.plan_on(lid)
       and not exists (select 1 from public.inquiry_messages m where m.inquiry_id = new.inquiry_id and m.sender_role = 'keeper')
       and public.free_replies_used(keeper) >= public.free_reply_limit() then
      raise exception 'reply_limit';
    end if;
  end if;
  update public.inquiries set updated_at = now() where id = new.inquiry_id;
  return new;
end $$;

-- Call and Text on a paid listing: the Keeper's number, for signed-in people only, and only while the plan runs.
create or replace function public.listing_contact(lid uuid) returns text language sql stable security definer set search_path = public as $$
  select contact_mobile from public.listings
  where id = lid and status = 'live' and auth.uid() is not null and public.plan_on(id)
$$;
revoke execute on function public.listing_contact(uuid) from public, anon;
grant execute on function public.listing_contact(uuid) to authenticated;
