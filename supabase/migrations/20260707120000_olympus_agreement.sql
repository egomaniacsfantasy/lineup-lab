-- Per-user player agreement scores (0-100). 50 = model is right; below 50 =
-- underrated (boost), above 50 = overrated (cut). One row per (user, player).
-- The public consensus = the average of every user's score for a player, applied
-- as a bounded (+/-5%) tilt to the model projection at display time.

create table if not exists public.olympus_agreement (
  user_id    uuid        not null default auth.uid(),
  position   text        not null check (position in ('QB','RB','WR','TE','K','DEF')),
  player     text        not null,
  score      smallint    not null check (score >= 0 and score <= 100),
  updated_at timestamptz not null default now(),
  primary key (user_id, position, player)
);

create index if not exists olympus_agreement_player_idx
  on public.olympus_agreement (position, player);

alter table public.olympus_agreement enable row level security;

-- Row-Level Security: every user may read and write ONLY their own rows. The
-- public consensus (an aggregate average) is computed server-side with the
-- service role, so individual scores never leave the server.
drop policy if exists agreement_select_own on public.olympus_agreement;
create policy agreement_select_own on public.olympus_agreement
  for select using (auth.uid() = user_id);

drop policy if exists agreement_insert_own on public.olympus_agreement;
create policy agreement_insert_own on public.olympus_agreement
  for insert with check (auth.uid() = user_id);

drop policy if exists agreement_update_own on public.olympus_agreement;
create policy agreement_update_own on public.olympus_agreement
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists agreement_delete_own on public.olympus_agreement;
create policy agreement_delete_own on public.olympus_agreement
  for delete using (auth.uid() = user_id);
