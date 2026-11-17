-- Deleting someone's row in public.profiles (for example from the Supabase table editor) now removes their whole
-- account: the sign-in record in auth.users goes too, which ends every session they have. Before this, a deleted
-- profile left the sign-in working, so the person could keep using the site (18 Nov 2026).
-- Deleting the person from Authentication -> Users already removed the profile (on delete cascade); both ways now
-- end in the same place.

create or replace function public.profiles_delete_account() returns trigger
language plpgsql security definer set search_path = public, auth as $$
begin
  delete from auth.users where id = old.id;   -- nothing to do when the account itself is what is being deleted
  return old;
end $$;

drop trigger if exists profiles_delete_account on public.profiles;
create trigger profiles_delete_account after delete on public.profiles
  for each row execute function public.profiles_delete_account();
