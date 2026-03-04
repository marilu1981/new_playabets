/**
 * Supabase client — used for Auth only on the frontend.
 * Data queries go through the Vercel API routes (server-side, service key).
 * The anon key is safe to expose in the browser.
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://guaeohezgweuhomyweld.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1YWVvaGV6Z3dldWhvbXl3ZWxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1NDE2MDUsImV4cCI6MjA4ODExNzYwNX0.aMXp0XC006VE9aBs9W38wl0vyPHHbkN_pM3pgK_HhGg";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
