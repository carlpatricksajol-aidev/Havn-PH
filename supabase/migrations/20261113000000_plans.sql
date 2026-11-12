-- Paid plans for Keepers. A listing carries a plan and the date its term ends.
-- Only an admin can set them (when the payment arrives); renters see the plan only while the term is running.

alter table public.listings
  add column if not exists plan text check (plan is null or plan in ('basic', 'verified', 'premium')),
  add column if not exists plan_until date;

-- Owners can never give themselves a plan or change when it ends.
create or replace function public.listings_plan_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then
    if new.plan is null then new.plan_until := null; end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.plan := null; new.plan_until := null;
  else
    new.plan := old.plan; new.plan_until := old.plan_until;
  end if;
  return new;
end $$;
drop trigger if exists listings_plan_guard on public.listings;
create trigger listings_plan_guard before insert or update on public.listings for each row execute function public.listings_plan_guard();

-- The public view gains the plan, shown only while the term is running.
create or replace view public.listings_public with (security_invoker = false) as
  select id, name, place_type, gender, description, area, lat, lng, rooms, advance_months, deposit_months, bills,
         available_from, amenities, rules, photos, host_name, created_at, published_at,
         case when plan_until is not null and plan_until >= (now() at time zone 'Asia/Manila')::date then plan end as plan
  from public.listings where status = 'live';
grant select on public.listings_public to anon, authenticated;
