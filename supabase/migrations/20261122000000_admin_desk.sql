-- The admin workspace has a private address that is never written in the site's code. Until now a device only
-- learned it by opening that address once; a new browser showed an admin no Admin link (20 Nov 2026).
-- The address now also lives in Vault (secret "admin_desk", set by hand, not in this file), and this function
-- hands it to signed-in admins only. Everyone else gets nothing.

create or replace function public.admin_desk() returns text
language sql stable security definer set search_path = public, extensions as $$
  select case when public.is_admin()
    then (select decrypted_secret from vault.decrypted_secrets where name = 'admin_desk') end;
$$;
revoke all on function public.admin_desk() from public, anon;
grant execute on function public.admin_desk() to authenticated;
