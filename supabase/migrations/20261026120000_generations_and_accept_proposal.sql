-- One row per AI generation: acceptance counters for FR-012 (accepted / proposed). No pasted text is stored.
create table public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  proposed_count smallint not null,
  accepted_count smallint not null default 0,
  created_at timestamptz not null default now(),
  constraint generations_proposed_count_range check (proposed_count between 1 and 10),
  constraint generations_accepted_count_range check (accepted_count between 0 and proposed_count),
  -- Target of the composite FK from cards: a card can only point at its owner's generation.
  constraint generations_id_user_id_key unique (id, user_id)
);

create index generations_user_id_idx on public.generations (user_id);

alter table public.generations enable row level security;

-- Counters change only through accept_proposal(): authenticated gets select and insert, no update or delete.
revoke all on public.generations from anon, authenticated;
grant select, insert on public.generations to authenticated;

create policy generations_select_own on public.generations
  for select to authenticated
  using (user_id = (select auth.uid()));

-- A new generation always starts with zero accepted proposals.
create policy generations_insert_own on public.generations
  for insert to authenticated
  with check (user_id = (select auth.uid()) and accepted_count = 0);

-- Link a card to the proposal it was accepted from; existing cards keep both columns null.
alter table public.cards add column generation_id uuid null;
alter table public.cards add column proposal_index smallint null;

alter table public.cards add constraint cards_generation_proposal_both_or_neither
  check ((generation_id is null) = (proposal_index is null));
alter table public.cards add constraint cards_proposal_index_range check (proposal_index between 0 and 9);
-- One card per proposal: makes accepting the same proposal twice idempotent.
alter table public.cards add constraint cards_generation_proposal_key unique (generation_id, proposal_index);
-- Composite FK forces the same owner (an FK check bypasses RLS); deleting a generation only unlinks the card.
alter table public.cards add constraint cards_generation_owner_fkey
  foreign key (generation_id, user_id) references public.generations (id, user_id)
  on delete set null (generation_id);

-- Saves an accepted proposal as a card and bumps accepted_count in one transaction.
-- Saving the same proposal again returns the existing card (created = false) and leaves the counter alone.
-- SQLSTATEs: 42501 no session, P0002 generation not found (missing or someone else's),
-- 22023 proposal index out of range, 23514 blank front/back (cards CHECK), P0001 internal inconsistency.
create function public.accept_proposal(
  p_generation_id uuid,
  p_proposal_index smallint,
  p_front text,
  p_back text
)
returns table (id uuid, front text, back text, created_at timestamptz, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_proposed_count smallint;
  v_card public.cards%rowtype;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Lock the generation so concurrent accepts of the same generation run one after another.
  select g.proposed_count into v_proposed_count
  from public.generations g
  where g.id = p_generation_id and g.user_id = v_user_id
  for update;

  if not found then
    raise exception 'generation not found' using errcode = 'P0002';
  end if;

  if p_proposal_index is null or p_proposal_index < 0 or p_proposal_index >= v_proposed_count then
    raise exception 'proposal index out of range' using errcode = '22023';
  end if;

  insert into public.cards as c (user_id, front, back, generation_id, proposal_index)
  values (v_user_id, p_front, p_back, p_generation_id, p_proposal_index)
  on conflict (generation_id, proposal_index) do nothing
  returning c.* into v_card;

  if v_card.id is not null then
    update public.generations g
    set accepted_count = g.accepted_count + 1
    where g.id = p_generation_id and g.user_id = v_user_id;

    return query select v_card.id, v_card.front, v_card.back, v_card.created_at, true;
    return;
  end if;

  -- Already accepted: the first saved content wins.
  select c.* into v_card
  from public.cards c
  where c.generation_id = p_generation_id
    and c.proposal_index = p_proposal_index
    and c.user_id = v_user_id;

  if not found then
    raise exception 'accepted card not found' using errcode = 'P0001';
  end if;

  return query select v_card.id, v_card.front, v_card.back, v_card.created_at, false;
end;
$$;

revoke execute on function public.accept_proposal(uuid, smallint, text, text) from public, anon;
grant execute on function public.accept_proposal(uuid, smallint, text, text) to authenticated;
