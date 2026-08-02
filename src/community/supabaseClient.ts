import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * True once real credentials are present in .env. Everything that touches
 * the community library should check this before querying, so the UI can
 * show a clear "not set up yet" state instead of a confusing network
 * error during local dev before a Supabase project exists.
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/**
 * Null until real credentials are supplied. Callers must check
 * `isSupabaseConfigured` (or just null-check this directly) before use --
 * deliberately not throwing here, so importing this module never crashes
 * the app before Phase 2 credentials exist.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string)
  : null;