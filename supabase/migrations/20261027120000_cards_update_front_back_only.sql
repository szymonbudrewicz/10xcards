-- Owners may edit only a card's content (front, back), enforced here and not only in the endpoint.
-- Why: with a table-wide UPDATE grant an owner could move a card to another (generation_id, proposal_index)
-- slot over REST, free the original slot and accept that proposal again, inflating accepted_count (FR-012).
-- user_id and created_at are not editable either. RLS policies are unchanged.
-- Consequence for S-05 (reviews): new cards columns (e.g. review schedule) are NOT updatable by authenticated;
-- writing them needs a security definer function or an explicit extension of this column grant.
revoke all on public.cards from anon, authenticated;
grant select, insert, delete on public.cards to authenticated;
grant update (front, back) on public.cards to authenticated;
