-- How often renters open and save a listing, for the Keeper's own page.
--   One row per listing per day (Manila time). Nobody reads or writes the table directly: the site calls
--   count_listing() when a renter opens or saves a live listing, and keeper_stats() gives a Keeper the last
--   30 days for their own listings. The Keeper's own visits and the team's are not counted.

create table if not exists public.listing_stats (
  listing_id uuid not null references public.listings(id) on delete cascade,
  day date not null,
  views int not null default 0,
  saves int not null default 0,
  primary key (listing_id, day)
);
alter table public.listing_stats enable row level security;
revoke all on public.listing_stats from anon, authenticated;

create or replace function public.count_listing(lid uuid, kind text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if kind not in ('view', 'save') then return; end if;
  if public.is_admin() then return; end if;
  if not exists (select 1 from public.listings where id = lid and status = 'live' and owner_id is distinct from auth.uid()) then return; end if;
  insert into public.listing_stats (listing_id, day, views, saves)
  values (lid, (now() at time zone 'Asia/Manila')::date, (kind = 'view')::int, (kind = 'save')::int)
  on conflict (listing_id, day) do update
    set views = public.listing_stats.views + excluded.views, saves = public.listing_stats.saves + excluded.saves;
end $$;
revoke execute on function public.count_listing(uuid, text) from public;
grant execute on function public.count_listing(uuid, text) to anon, authenticated;

create or replace function public.keeper_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('listing_id', s.listing_id, 'day', s.day, 'views', s.views, 'saves', s.saves) order by s.day), '[]'::jsonb)
  from public.listing_stats s
  join public.listings l on l.id = s.listing_id and l.owner_id = auth.uid()
  where s.day > (now() at time zone 'Asia/Manila')::date - 30
$$;
revoke execute on function public.keeper_stats() from public, anon;
grant execute on function public.keeper_stats() to authenticated;
