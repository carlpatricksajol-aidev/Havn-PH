-- Sign-in with a mobile number (a code by text) beside email. People who sign in by phone have no email address.

-- New account -> profile. A phone sign-up starts with its (already proven) number filled in.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare d text := regexp_replace(coalesce(new.phone, ''), '\D', '', 'g');
begin
  insert into public.profiles (id, email, full_name, mobile)
  values (new.id, nullif(new.email, ''),
          nullif(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'), ''),
          case when d ~ '^639\d{9}$' then '0' || substr(d, 3) end);
  return new;
end $$;

-- A signed-in person with no email can still send the team a message (their mobile number is in their profile).
alter table public.contact_messages alter column email drop not null;
alter table public.contact_messages add column if not exists mobile text check (mobile is null or mobile ~ '^09\d{9}$');
alter table public.contact_messages drop constraint if exists contact_reachable;
alter table public.contact_messages add constraint contact_reachable check (email is not null or mobile is not null);

create or replace function public.limit_contact() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.contact_messages
      where ((new.email is not null and email = new.email) or (new.mobile is not null and mobile = new.mobile))
        and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many messages. Please wait a little and try again.';
  end if;
  return new;
end $$;
