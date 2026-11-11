-- Admin workspace: leads move through stages, renters can see what they sent, contact messages can be closed.
alter table public.inquiries
  add column if not exists status text not null default 'new' check (status in ('new', 'contacted', 'viewing', 'moved_in', 'closed')),
  add column if not exists admin_note text check (admin_note is null or char_length(admin_note) <= 1000),
  add column if not exists renter_id uuid default auth.uid() references public.profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();
create index if not exists inquiries_renter_idx on public.inquiries (renter_id);

create policy "inquiries: renter reads own" on public.inquiries for select using (renter_id = auth.uid());
create policy "inquiries: admin updates" on public.inquiries for update using (public.is_admin()) with check (public.is_admin());

alter table public.contact_messages
  add column if not exists status text not null default 'new' check (status in ('new', 'done'));
create policy "contact: admin updates" on public.contact_messages for update using (public.is_admin()) with check (public.is_admin());

-- Admins may read every profile already ("own profile: read"); nobody but the owner can change one.
