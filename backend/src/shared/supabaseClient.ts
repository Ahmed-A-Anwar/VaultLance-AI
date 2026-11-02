/**
 * Supabase Client — singleton for backend server-side usage.
 *
 * Uses the SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_PUBLISHABLE_KEY
 * as fallback) from environment variables.
 *
 * The service role key bypasses Row Level Security and is required for
 * server-side operations like inserting user profiles.
 *
 * Set USE_IN_MEMORY_DB=true to disable the Supabase client entirely
 * (used by unit tests and demo mode).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as dotenvConfig } from "dotenv";

dotenvConfig();

const forceInMemory = process.env.USE_IN_MEMORY_DB === "true";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY;

if (!forceInMemory && !supabaseUrl) {
  console.warn(
    "[supabaseClient] SUPABASE_URL is not set. Supabase features will not work."
  );
}
if (!forceInMemory && !supabaseKey) {
  console.warn(
    "[supabaseClient] Neither SUPABASE_SERVICE_ROLE_KEY nor SUPABASE_PUBLISHABLE_KEY is set."
  );
}

/**
 * The Supabase client instance.
 * Will be `null` if the required env vars are missing or USE_IN_MEMORY_DB is set.
 */
export const supabase: SupabaseClient | null =
  !forceInMemory && supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      })
    : null;

/**
 * Returns true when Supabase credentials are configured and the client is available.
 */
export function isSupabaseConfigured(): boolean {
  return supabase !== null;
}
