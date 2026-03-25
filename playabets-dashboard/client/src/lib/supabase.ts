/**
 * Supabase client — used for Auth only on the frontend.
 * Data queries go through the Vercel API routes (server-side, service key).
 * The anon key is safe to expose in the browser.
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://guaeohezgweuhomyweld.supabase.co";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;


export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
