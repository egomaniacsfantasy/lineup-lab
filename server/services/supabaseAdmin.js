import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://ffilmwousdjjbvhztzqr.supabase.co';

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || null;
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_KEY ||
  'sb_publishable_QJRxVLfxx55CWUa6psE04g_RqEvnTSw';

let serviceClient = null;
let anonClient = null;

export function getSupabaseAdmin() {
  if (!SERVICE_ROLE_KEY) return null;
  if (!serviceClient) {
    serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return serviceClient;
}

function getAnonClient() {
  if (!anonClient) {
    anonClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return anonClient;
}

export async function getRequestUserId(req) {
  const bearer = req.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearer) {
    const { data, error } = await getAnonClient().auth.getUser(bearer);
    if (!error && data?.user?.id) return data.user.id;
  }

  return (
    req.get('x-owner-user-id') ||
    req.get('x-user-id') ||
    req.body?.ownerUserId ||
    req.query?.ownerUserId ||
    null
  );
}
