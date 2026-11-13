-- Reactions on messages in a conversation (heart, laugh, wow, sad, angry, like).
--   One reaction per person per message. `target` is the reply's id (inquiry_messages.id), or 'first' for the
--   renter's opening message, which lives on the inquiry itself. Only the people in the conversation can see
--   or add reactions, and each person can change or remove only their own.

create table if not exists public.message_reactions (
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  target     text not null check (char_length(target) between 1 and 40),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  emoji      text not null check (emoji in ('❤️', '😆', '😮', '😢', '😠', '👍')),
  created_at timestamptz not null default now(),
  primary key (inquiry_id, target, user_id)
);

alter table public.message_reactions enable row level security;
drop policy if exists "reactions: people in the conversation read" on public.message_reactions;
drop policy if exists "reactions: own add" on public.message_reactions;
drop policy if exists "reactions: own change" on public.message_reactions;
drop policy if exists "reactions: own remove" on public.message_reactions;
create policy "reactions: people in the conversation read" on public.message_reactions for select to authenticated
  using (public.inquiry_role(inquiry_id) is not null);
create policy "reactions: own add" on public.message_reactions for insert to authenticated
  with check (user_id = auth.uid() and public.inquiry_role(inquiry_id) is not null);
create policy "reactions: own change" on public.message_reactions for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.inquiry_role(inquiry_id) is not null);
create policy "reactions: own remove" on public.message_reactions for delete to authenticated
  using (user_id = auth.uid());
revoke all on public.message_reactions from anon;
grant select, insert, update, delete on public.message_reactions to authenticated;
