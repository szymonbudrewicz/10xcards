-- authenticated keeps only the four operations; schema default privileges (TRUNCATE, REFERENCES, TRIGGER) are removed.
revoke all on public.cards from anon, authenticated;
grant select, insert, update, delete on public.cards to authenticated;

-- btrim only strips ASCII spaces; reject any all-whitespace value (tabs, newlines) as well as the empty string.
alter table public.cards drop constraint cards_front_not_blank;
alter table public.cards drop constraint cards_back_not_blank;
alter table public.cards add constraint cards_front_not_blank check (front !~ '^\s*$');
alter table public.cards add constraint cards_back_not_blank check (back !~ '^\s*$');
