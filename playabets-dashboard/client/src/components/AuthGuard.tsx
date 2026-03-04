/**
 * AuthGuard — wraps the entire app.
 * Shows the Login page if the user is not authenticated.
 * Listens to Supabase auth state changes for real-time session management.
 */

import { useState, useEffect, ReactNode } from "react";
import { supabase } from "../lib/supabase";
import Login from "../pages/Login";

interface AuthGuardProps {
  children: ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const [session, setSession] = useState<boolean | null>(null); // null = loading

  useEffect(() => {
    // Check existing session on mount
    supabase.auth.getSession().then(({ data }) => {
      setSession(!!data.session);
    });

    // Listen for auth state changes (login, logout, token refresh)
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(!!s);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  // Loading state — show nothing while checking session
  if (session === null) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "oklch(0.115 0.035 155)" }}
      >
        <div
          className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "oklch(0.72 0.14 85)", borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  if (!session) {
    return <Login onLogin={() => setSession(true)} />;
  }

  return <>{children}</>;
}
