/**
 * The pure parts of turning Supabase rows into league connections.
 *
 * Split out of LeagueConnectionContext so it can be imported by a test. The
 * context itself pulls in React and the Supabase client and cannot be loaded
 * outside a bundler, which is why the naming bug it used to contain could only
 * ever be checked by grepping the source — and grep does not notice a mapping
 * that is present but wrong.
 */

export interface DbLeagueRow {
  provider: string;
  league_id: string;
  season: string | null;
  member_id: string | null;
  username: string | null;
  display_name: string | null;
  /* Optional because the column is newer than the table. */
  league_name?: string | null;
  is_active: boolean;
  created_at: string;
}

/**
 * The league's own name, or undefined.
 *
 * This is the whole fix. The mapping used to omit it, so every consumer fell
 * through to displayName — the account's username, identical on every row —
 * and a switcher holding fourteen leagues showed one name fourteen times.
 *
 * Empty string counts as absent: a row written before the column existed, or
 * one saved from a connection that had no name yet, must fall back rather than
 * render as a league whose name is nothing.
 */
export function leagueNameFromRow(row: Pick<DbLeagueRow, 'league_name'>): string | undefined {
  const name = row.league_name;
  if (typeof name !== 'string') return undefined;
  const trimmed = name.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Does this Supabase error mean olympus_leagues has no league_name column?
 *
 * PostgREST reports an unknown column as PGRST204 and names it in the message.
 * The name is matched as well as the code so that an unrelated PGRST204 cannot
 * switch league names off for the rest of the session.
 */
export function isMissingLeagueNameColumn(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  const message = error.message ?? '';
  return (error.code === 'PGRST204' || /column/i.test(message)) && /league_name/.test(message);
}
