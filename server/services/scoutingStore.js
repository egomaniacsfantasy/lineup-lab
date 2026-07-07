import { getSupabaseAdmin } from './supabaseAdmin.js';

function requireStore() {
  const db = getSupabaseAdmin();
  if (!db) {
    const error = new Error('scouting_store_unconfigured');
    error.status = 503;
    throw error;
  }
  return db;
}

export async function upsertScoutingEvents(events) {
  if (!events.length) return { inserted: 0 };
  const uniqueEvents = [...new Map(events.map((event) => [event.id, event])).values()];
  const db = requireStore();
  const { error } = await db.from('scouting_events').upsert(uniqueEvents, { onConflict: 'id' });
  if (error) throw error;
  return { inserted: uniqueEvents.length };
}

export async function getScoutingEvents({ provider, leagueId }) {
  const db = requireStore();
  const { data, error } = await db
    .from('scouting_events')
    .select('*')
    .eq('provider', provider)
    .eq('league_id', leagueId);
  if (error) throw error;
  return data ?? [];
}

export async function getScoutingReads({ provider, leagueId }) {
  const db = requireStore();
  const { data, error } = await db
    .from('scouting_reads')
    .select('*')
    .eq('provider', provider)
    .eq('league_id', leagueId);
  if (error) throw error;
  return data ?? [];
}

export async function replaceScoutingReads({ provider, leagueId, reads }) {
  const db = requireStore();
  const { error: deleteError } = await db
    .from('scouting_reads')
    .delete()
    .eq('provider', provider)
    .eq('league_id', leagueId);
  if (deleteError) throw deleteError;

  if (!reads.length) return { written: 0 };
  const { error } = await db.from('scouting_reads').upsert(reads);
  if (error) throw error;
  return { written: reads.length };
}

export async function getScoutingEdit({ ownerUserId, leagueId, managerKey }) {
  if (!ownerUserId) return null;
  const db = requireStore();
  const { data, error } = await db
    .from('scouting_edits')
    .select('*')
    .eq('owner_user_id', ownerUserId)
    .eq('league_id', leagueId)
    .eq('manager_key', managerKey)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function getScoutingEdits({ ownerUserId, leagueId }) {
  if (!ownerUserId) return [];
  const db = requireStore();
  const { data, error } = await db
    .from('scouting_edits')
    .select('*')
    .eq('owner_user_id', ownerUserId)
    .eq('league_id', leagueId);
  if (error) throw error;
  return data ?? [];
}

export async function upsertScoutingEdit({
  ownerUserId,
  leagueId,
  managerKey,
  overrides = {},
  untouchables = [],
  favoriteTeam = null,
  negotiationStyle = null,
  notes = null,
}) {
  const db = requireStore();
  const row = {
    owner_user_id: ownerUserId,
    league_id: leagueId,
    manager_key: managerKey,
    overrides,
    untouchables,
    favorite_team: favoriteTeam,
    negotiation_style: negotiationStyle,
    notes,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await db
    .from('scouting_edits')
    .upsert(row)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function getEffectiveRead(ownerUserId, leagueId, managerKey, provider = 'sleeper') {
  const db = requireStore();
  const [{ data: read, error: readError }, edit] = await Promise.all([
    db
      .from('scouting_reads')
      .select('*')
      .eq('provider', provider)
      .eq('league_id', leagueId)
      .eq('manager_key', managerKey)
      .maybeSingle(),
    getScoutingEdit({ ownerUserId, leagueId, managerKey }),
  ]);
  if (readError) throw readError;

  return mergeReadAndEdit(read, edit);
}

export function mergeReadAndEdit(read, edit, needs = null) {
  const traits = {
    ...(read?.traits ?? {}),
    ...(edit?.overrides ?? {}),
  };
  if (needs) traits.needs = needs;

  return {
    manager_key: read?.manager_key ?? edit?.manager_key ?? null,
    provider: read?.provider ?? null,
    league_id: read?.league_id ?? edit?.league_id ?? null,
    traits,
    evidence: read?.evidence ?? [],
    edit: edit
      ? {
          overrides: edit.overrides ?? {},
          untouchables: edit.untouchables ?? [],
          favorite_team: edit.favorite_team ?? null,
          negotiation_style: edit.negotiation_style ?? null,
          notes: edit.notes ?? null,
          updated_at: edit.updated_at,
        }
      : null,
    computed_at: read?.computed_at ?? null,
  };
}
