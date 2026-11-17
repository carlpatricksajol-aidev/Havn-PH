-- Sample listings in the database (dry run, 17 Nov 2026).
-- A sample is a normal listing owned by a real Keeper account, so messages, the Keeper's dashboard, emails and
-- plans all work end to end. The flag only changes what the public sees: the Sample badge, the sample notice,
-- and no search-engine indexing (api/page.js). Only admins can set or clear it.

alter table public.listings add column if not exists sample boolean not null default false;

create or replace function public.listings_sample_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    new.sample := case when tg_op = 'INSERT' then false else old.sample end;
  end if;
  return new;
end $$;

drop trigger if exists listings_sample_guard on public.listings;
create trigger listings_sample_guard before insert or update on public.listings
  for each row execute function public.listings_sample_guard();

create or replace view public.listings_public with (security_invoker = false) as
  select id, name, place_type, gender, description, area, lat, lng, rooms, advance_months, deposit_months, bills,
         available_from, amenities, rules, photos, host_name, created_at, published_at,
         case when plan_until is not null and plan_until >= (now() at time zone 'Asia/Manila')::date then plan end as plan,
         sample
  from public.listings where status = 'live';
grant select on public.listings_public to anon, authenticated;
