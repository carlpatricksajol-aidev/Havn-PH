-- Conversations: replies under a renter's inquiry. The renter, the listing's Keeper and the ECStay team
-- (admins) can read and write in a thread; nobody else can see it.

create table if not exists public.inquiry_messages (
  id          uuid primary key default gen_random_uuid(),
  inquiry_id  uuid not null references public.inquiries(id) on delete cascade,
  sender_id   uuid default auth.uid() references auth.users(id) on delete set null,
  sender_role text not null check (sender_role in ('renter', 'keeper', 'team')),
  body        text not null check (char_length(trim(body)) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index if not exists inquiry_messages_inquiry_idx on public.inquiry_messages (inquiry_id, created_at);

-- Which side of a conversation the signed-in person is on (null = not part of it).
create or replace function public.inquiry_role(inq uuid) returns text language sql stable security definer set search_path = public as $$
  select case
    when q.renter_id = auth.uid() then 'renter'
    when l.owner_id = auth.uid() then 'keeper'
    when public.is_admin() then 'team'
  end
  from public.inquiries q left join public.listings l on l.id = q.listing_id
  where q.id = inq
$$;

-- Flood protection: at most 40 replies per person per hour.
create or replace function public.limit_replies() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.inquiry_messages where sender_id = auth.uid() and created_at > now() - interval '1 hour') >= 40 then
    raise exception 'Too many messages. Please wait a little and try again.';
  end if;
  update public.inquiries set updated_at = now() where id = new.inquiry_id;
  return new;
end $$;
drop trigger if exists inquiry_messages_rate on public.inquiry_messages;
create trigger inquiry_messages_rate before insert on public.inquiry_messages for each row execute function public.limit_replies();

alter table public.inquiry_messages enable row level security;
drop policy if exists "replies: people in the conversation read" on public.inquiry_messages;
drop policy if exists "replies: people in the conversation write" on public.inquiry_messages;
create policy "replies: people in the conversation read" on public.inquiry_messages for select to authenticated
  using (public.inquiry_role(inquiry_id) is not null);
create policy "replies: people in the conversation write" on public.inquiry_messages for insert to authenticated
  with check (sender_id = auth.uid() and sender_role = public.inquiry_role(inquiry_id));
grant select, insert on public.inquiry_messages to authenticated;
