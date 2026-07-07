import { createClient } from '@supabase/supabase-js';

/**
 * Odds Gods Supabase project. The publishable key is designed to ship in the
 * browser — Row Level Security on every table is what actually protects data,
 * so a user only ever sees their own rows. Overridable via Vite env if needed.
 */
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://ffilmwousdjjbvhztzqr.supabase.co';
const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_KEY ||
  'sb_publishable_QJRxVLfxx55CWUa6psE04g_RqEvnTSw';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
