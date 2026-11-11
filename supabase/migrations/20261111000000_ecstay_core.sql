-- ECStay core: landlord profiles, listings (with review), renter inquiries, contact messages, listing photos,
-- and the email triggers. Run once on a new Supabase project (SQL editor, or `supabase db push`).
-- Everything is protected by row-level security: landlords only see and change their own rows, the public only
-- reads live listings, and only admins review listings or read messages sent to the team.

create extension if not exists pgcrypto;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------------------------------------------
-- Profiles: one per signed-in person (created automatically on first sign-in)
-- ---------------------------------------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  full_name     text check (full_name is null or char_length(full_name) <= 80),
  mobile        text check (mobile is null or mobile ~ '^09\d{9}$'),
  contact_pref  text not null default 'either' check (contact_pref in ('text', 'call', 'either')),
  marketing_ok  boolean not null default true,
  role          text not null default 'host' check (role in ('host', 'admin')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- New account -> profile (name and photo from Google when they used it).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, nullif(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'), ''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------------------------------------
-- Listings
-- ---------------------------------------------------------------------------------------------------------
create type public.listing_status as enum ('draft', 'review', 'changes', 'live', 'paused', 'removed');

create table public.listings (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles(id) on delete cascade,
  status          public.listing_status not null default 'draft',
  name            text check (name is null or char_length(name) <= 70),
  place_type      text check (place_type is null or place_type in ('Boarding house', 'Dormitory', 'Apartment', 'House')),
  gender          text check (gender is null or gender in ('female', 'male', 'mixed')),
  description     text check (description is null or char_length(description) <= 800),
  area            text check (area is null or char_length(area) <= 60),
  address         text check (address is null or char_length(address) <= 160),   -- not public (see listings_public)
  lat             double precision check (lat is null or lat between 6.8 and 7.6),   -- Davao City and nearby
  lng             double precision check (lng is null or lng between 125.2 and 125.9),
  rooms           jsonb not null default '[]'::jsonb,    -- [{type, price, count}]
  advance_months  smallint check (advance_months between 0 and 6),
  deposit_months  smallint check (deposit_months between 0 and 6),
  bills           jsonb not null default '{}'::jsonb,    -- {electric, water}: included | meter | shared
  available_from  text check (available_from is null or available_from ~ '^\d{4}-\d{2}$'),
  amenities       text[] not null default '{}',
  rules           jsonb not null default '{}'::jsonb,    -- {curfew, visitors, cooking, pets, smoking, other}
  photos          jsonb not null default '[]'::jsonb,    -- [{path, url, w, h}], first = cover
  contact_mobile  text check (contact_mobile is null or contact_mobile ~ '^09\d{9}$'),
  confirmed       boolean not null default false,
  host_name       text,                                  -- first name shown on the listing, set on submit
  review_note     text,
  submitted_at    timestamptz,
  published_at    timestamptz,
  reminded_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index listings_owner_idx on public.listings (owner_id);
create index listings_status_idx on public.listings (status);

-- Is the listing complete enough to review? (Same rules as ECS.STEPS in assets/js/accounts.js.)
create or replace function public.listing_ready(l public.listings) returns boolean language sql immutable as $$
  select coalesce(char_length(trim(l.name)) >= 4, false)
     and l.place_type is not null and l.gender is not null
     and coalesce(char_length(trim(l.description)) >= 40, false)
     and l.area is not null and l.address is not null and l.lat is not null and l.lng is not null
     and jsonb_array_length(l.rooms) > 0
     and l.advance_months is not null and l.deposit_months is not null
     and cardinality(l.amenities) >= 1 and (l.rules ? 'visitors')
     and jsonb_array_length(l.photos) >= 5
     and l.contact_mobile is not null and l.confirmed;
$$;

-- What owners may and may not do. Admins may do anything.
create or replace function public.listings_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  content_changed boolean;
begin
  new.updated_at := now();
  if public.is_admin() then
    if new.status = 'live' and old.status is distinct from 'live' then new.published_at := now(); new.review_note := null; end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'draft'; new.review_note := null; new.published_at := null; new.submitted_at := null; new.host_name := null;
    return new;
  end if;
  -- Owners can never set these themselves.
  new.review_note := old.review_note; new.published_at := old.published_at; new.owner_id := old.owner_id; new.host_name := old.host_name;
  content_changed := (new.name, new.place_type, new.gender, new.description, new.area, new.address, new.lat, new.lng, new.rooms,
    new.advance_months, new.deposit_months, new.bills, new.available_from, new.amenities, new.rules, new.photos, new.contact_mobile)
    is distinct from (old.name, old.place_type, old.gender, old.description, old.area, old.address, old.lat, old.lng, old.rooms,
    old.advance_months, old.deposit_months, old.bills, old.available_from, old.amenities, old.rules, old.photos, old.contact_mobile);
  if old.status = 'removed' then raise exception 'This listing was removed.'; end if;
  if new.status is distinct from old.status then
    if new.status = 'review' and old.status in ('draft', 'changes') then
      if not public.listing_ready(new) then raise exception 'A few steps still need your details.'; end if;
      new.submitted_at := now();
      new.host_name := (select split_part(coalesce(full_name, ''), ' ', 1) from public.profiles where id = old.owner_id);
    elsif new.status = 'paused' and old.status = 'live' and not content_changed then null;
    elsif new.status = 'live' and old.status = 'paused' and not content_changed then null;
    else raise exception 'That change is not allowed.';
    end if;
  elsif content_changed and old.status in ('live', 'paused') then
    -- Edits to a live listing are checked again before they show.
    if not public.listing_ready(new) then raise exception 'A few steps still need your details.'; end if;
    new.status := 'review'; new.submitted_at := now();
  end if;
  return new;
end $$;
create trigger listings_guard before insert or update on public.listings for each row execute function public.listings_guard();

-- What the public sees: live listings, without the street address or the contact number.
create view public.listings_public with (security_invoker = false) as
  select id, name, place_type, gender, description, area, lat, lng, rooms, advance_months, deposit_months, bills,
         available_from, amenities, rules, photos, host_name, created_at, published_at
  from public.listings where status = 'live';
grant select on public.listings_public to anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- Inquiries (renters -> landlords) and contact messages (anyone -> the team)
-- ---------------------------------------------------------------------------------------------------------
create table public.inquiries (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid references public.listings(id) on delete set null,
  listing_ref   text not null check (char_length(listing_ref) <= 80),   -- the room id on the site (samples too)
  listing_name  text check (char_length(listing_name) <= 120),
  renter_name   text not null check (char_length(trim(renter_name)) between 2 and 80),
  renter_mobile text not null check (renter_mobile ~ '^09\d{9}$'),
  renter_email  text check (renter_email is null or renter_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$'),
  move_in       text check (char_length(move_in) <= 40),
  message       text check (char_length(message) <= 1000),
  created_at    timestamptz not null default now()
);
create index inquiries_listing_idx on public.inquiries (listing_id);

create table public.contact_messages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(trim(name)) between 2 and 80),
  email       text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$'),
  topic       text not null default 'question' check (topic in ('question', 'report', 'privacy', 'partner', 'other')),
  message     text not null check (char_length(trim(message)) between 5 and 3000),
  created_at  timestamptz not null default now()
);

-- Simple flood protection: at most 5 inquiries per mobile per hour, 5 contact messages per email per hour.
create or replace function public.limit_rate() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'inquiries' and (select count(*) from public.inquiries where renter_mobile = new.renter_mobile and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many messages. Please wait a little and try again.';
  end if;
  if tg_table_name = 'contact_messages' and (select count(*) from public.contact_messages where email = new.email and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many messages. Please wait a little and try again.';
  end if;
  -- Link the inquiry to a real listing when the room id is one.
  if tg_table_name = 'inquiries' then
    new.listing_id := (select id from public.listings where id::text = new.listing_ref and status = 'live');
  end if;
  return new;
end $$;
create trigger inquiries_rate before insert on public.inquiries for each row execute function public.limit_rate();
create trigger contact_rate before insert on public.contact_messages for each row execute function public.limit_rate();

-- ---------------------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.inquiries enable row level security;
alter table public.contact_messages enable row level security;

create policy "own profile: read" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "own profile: update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (full_name, mobile, contact_pref, marketing_ok) on public.profiles to authenticated;

create policy "listings: owner reads own, admin reads all" on public.listings for select using (owner_id = auth.uid() or public.is_admin());
create policy "listings: owner creates" on public.listings for insert with check (owner_id = auth.uid());
create policy "listings: owner or admin updates" on public.listings for update using (owner_id = auth.uid() or public.is_admin());
create policy "listings: owner deletes drafts" on public.listings for delete using (owner_id = auth.uid() and status = 'draft');

create policy "inquiries: anyone sends" on public.inquiries for insert to anon, authenticated with check (true);
create policy "inquiries: landlord or admin reads" on public.inquiries for select using (
  public.is_admin() or listing_id in (select id from public.listings where owner_id = auth.uid()));

create policy "contact: anyone sends" on public.contact_messages for insert to anon, authenticated with check (true);
create policy "contact: admin reads" on public.contact_messages for select using (public.is_admin());

-- ---------------------------------------------------------------------------------------------------------
-- Listing photos: public to view, each landlord writes only in their own folder (<user id>/...)
-- ---------------------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-photos', 'listing-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy "photos: owner uploads" on storage.objects for insert to authenticated
  with check (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos: owner deletes" on storage.objects for delete to authenticated
  using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------------------------------------
-- Emails: changes call the `notify` Edge Function, which renders a template and sends it with Resend.
-- The function URL and its secret live in Vault (see supabase/README.md, step 5).
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.notify(event text, payload jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  url text := (select decrypted_secret from vault.decrypted_secrets where name = 'notify_url');
  secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'notify_secret');
begin
  if url is null or secret is null then return; end if;   -- emails not set up yet: never block the change itself
  perform net.http_post(url := url, body := jsonb_build_object('event', event, 'data', payload),
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Notify-Secret', secret));
end $$;

create or replace function public.on_profile_created() returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.notify('welcome', jsonb_build_object('profile_id', new.id)); return new; end $$;
create trigger profiles_welcome after insert on public.profiles for each row execute function public.on_profile_created();

create or replace function public.on_listing_status() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status in ('review', 'live', 'changes') then
    perform public.notify('listing-' || new.status::text, jsonb_build_object('listing_id', new.id));
  end if;
  return new;
end $$;
create trigger listings_status_mail after update on public.listings for each row execute function public.on_listing_status();

create or replace function public.on_inquiry() returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.notify('inquiry', jsonb_build_object('inquiry_id', new.id)); return new; end $$;
create trigger inquiries_mail after insert on public.inquiries for each row execute function public.on_inquiry();

create or replace function public.on_contact() returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.notify('contact', jsonb_build_object('message_id', new.id)); return new; end $$;
create trigger contact_mail after insert on public.contact_messages for each row execute function public.on_contact();

-- Daily at 10:00 Manila time: remind landlords about drafts untouched for a day (once per draft).
create or replace function public.remind_drafts() returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select l.id from public.listings l join public.profiles p on p.id = l.owner_id
           where l.status = 'draft' and l.reminded_at is null and p.marketing_ok
             and l.updated_at < now() - interval '24 hours' and l.updated_at > now() - interval '14 days'
  loop
    perform public.notify('finish-your-listing', jsonb_build_object('listing_id', r.id));
    update public.listings set reminded_at = now() where id = r.id;
  end loop;
end $$;
-- Needs the pg_cron extension (Database > Extensions). Then:
-- select cron.schedule('ecstay-draft-reminders', '0 2 * * *', 'select public.remind_drafts()');
