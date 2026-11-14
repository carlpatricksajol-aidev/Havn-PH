-- Site numbers for the admin workspace: how many people visit, and what they search for.
--   One row per day (Manila time), kind and key. kind 'visit' = a browser opened the site that day (key '');
--   kind 'search' = a place or words someone searched (key = the place name or the words, lower case).
--   The site calls count_site(); admins read everything with admin_insights(), which also gives each listing's
--   views and saves for the last 30 days. The team's own visits are not counted. No personal data is kept.

create table if not exists public.site_stats (
  day  date not null,
  kind text not null check (kind in ('visit', 'search')),
  key  text not null default '',
  n    int  not null default 0,
  primary key (day, kind, key)
);
alter table public.site_stats enable row level security;
revoke all on public.site_stats from anon, authenticated;

create or replace function public.count_site(kind text, key text default '') returns void
language plpgsql security definer set search_path = public as $$
declare k text := left(lower(trim(coalesce(key, ''))), 60);
begin
  if kind not in ('visit', 'search') then return; end if;
  if public.is_admin() then return; end if;
  if kind = 'visit' then k := ''; elsif k = '' then return; end if;
  insert into public.site_stats (day, kind, key, n) values ((now() at time zone 'Asia/Manila')::date, kind, k, 1)
  on conflict on constraint site_stats_pkey do update set n = public.site_stats.n + 1;
end $$;
revoke execute on function public.count_site(text, text) from public;
grant execute on function public.count_site(text, text) to anon, authenticated;

create or replace function public.admin_insights() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.is_admin() then jsonb_build_object(
    'site', (select coalesce(jsonb_agg(jsonb_build_object('day', s.day, 'kind', s.kind, 'key', s.key, 'n', s.n) order by s.day), '[]'::jsonb)
             from public.site_stats s where s.day > (now() at time zone 'Asia/Manila')::date - 30),
    'listings', (select coalesce(jsonb_agg(jsonb_build_object('listing_id', x.listing_id, 'views', x.views, 'saves', x.saves)), '[]'::jsonb)
                 from (select listing_id, sum(views)::int as views, sum(saves)::int as saves from public.listing_stats
                       where day > (now() at time zone 'Asia/Manila')::date - 30 group by listing_id) x)
  ) end
$$;
revoke execute on function public.admin_insights() from public, anon;
grant execute on function public.admin_insights() to authenticated;
