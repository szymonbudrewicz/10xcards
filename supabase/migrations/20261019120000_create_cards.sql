-- Flashcards owned by a single user. Isolation is enforced here (RLS), not in application code.
create table public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  front text not null,
  back text not null,
  created_at timestamptz not null default now(),
  constraint cards_front_not_blank check (length(btrim(front)) > 0),
  constraint cards_back_not_blank check (length(btrim(back)) > 0)
);

create index cards_user_id_idx on public.cards (user_id);

alter table public.cards enable row level security;

-- Do not rely on schema default privileges: anon gets nothing, authenticated gets exactly the four operations.
revoke all on public.cards from anon;
grant select, insert, update, delete on public.cards to authenticated;

create policy cards_select_own on public.cards
  for select to authenticated
  using (true);

create policy cards_insert_own on public.cards
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- WITH CHECK keeps the owner from reassigning a row to another account.
create policy cards_update_own on public.cards
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy cards_delete_own on public.cards
  for delete to authenticated
  using (user_id = (select auth.uid()));
