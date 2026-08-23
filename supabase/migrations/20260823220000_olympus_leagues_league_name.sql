-- The league's own name, on the account.
--
-- olympus_leagues stored who you are in a league (member_id, username,
-- display_name) but never what the league is called. Every league rebuilt from
-- these rows therefore arrived nameless, and the UI fell through to
-- display_name — the account's username, which is identical on every row. An
-- account with fourteen leagues showed the same name fourteen times, and the
-- only thing that actually distinguished them was a league id nobody sees.
--
-- Nullable on purpose. Rows written before this column exists stay valid and
-- read as "no name yet"; they fill in the next time that league is saved. The
-- app treats null and empty alike and falls back rather than rendering a league
-- whose name is nothing.
--
-- Safe to run more than once, and safe to run while the old code is deployed:
-- an extra nullable column changes nothing for a writer that does not mention
-- it. The app also survives this migration NOT having been run — it notices the
-- missing column, warns once, and saves without the name.

alter table public.olympus_leagues
  add column if not exists league_name text;

comment on column public.olympus_leagues.league_name is
  'Friendly league name shown in the switcher. Null for rows written before '
  'this column existed; the app falls back to the manager name until the '
  'league is saved again.';
