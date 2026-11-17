-- First and last name, and the right welcome email for each person (18 Nov 2026).
--
-- Before: every new account got the Keeper welcome ("How listing works") the moment it was created, renters too.
-- Now:
--   * a renter gets the renter welcome once they finish "A few details first" (the site says which way they came in:
--     joined_as = 'renter' or 'keeper', from the page they signed in from);
--   * a Keeper gets the Keeper welcome when they start their first listing (not before, and only once).
-- full_name stays filled (first + last) because emails, the admin desk and messages read it.

alter table public.profiles
  add column if not exists first_name text check (first_name is null or char_length(first_name) <= 40),
  add column if not exists last_name text check (last_name is null or char_length(last_name) <= 40),
  add column if not exists joined_as text check (joined_as is null or joined_as in ('renter', 'keeper')),
  add column if not exists welcomed_renter_at timestamptz,
  add column if not exists welcomed_keeper_at timestamptz;

grant update (first_name, last_name, joined_as) on public.profiles to authenticated;

-- Everyone who already has an account got the old (Keeper) welcome when it was created: never send it twice.
update public.profiles set welcomed_keeper_at = created_at where welcomed_keeper_at is null;

-- No welcome at sign-up any more.
drop trigger if exists profiles_welcome on public.profiles;

-- Renter welcome: when a renter's details are first complete (name and mobile), once, and only with an email.
create or replace function public.profiles_welcome_renter() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.welcomed_renter_at is null and new.email is not null
     and coalesce(new.joined_as, 'renter') = 'renter'
     and new.full_name is not null and new.mobile is not null
     and (old.full_name is null or old.mobile is null)
     and not exists (select 1 from public.listings where owner_id = new.id) then
    new.welcomed_renter_at := now();
    perform public.notify('welcome-renter', jsonb_build_object('profile_id', new.id));
  end if;
  return new;
end $$;
drop trigger if exists profiles_welcome_renter on public.profiles;
create trigger profiles_welcome_renter before update on public.profiles
  for each row execute function public.profiles_welcome_renter();

-- Keeper welcome: when someone starts their first listing (sample listings never count).
create or replace function public.listings_welcome_keeper() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not new.sample then
    update public.profiles set welcomed_keeper_at = now()
     where id = new.owner_id and welcomed_keeper_at is null and email is not null;
    if found then perform public.notify('welcome', jsonb_build_object('profile_id', new.owner_id)); end if;
  end if;
  return new;
end $$;
drop trigger if exists listings_welcome_keeper on public.listings;
create trigger listings_welcome_keeper after insert on public.listings
  for each row execute function public.listings_welcome_keeper();
