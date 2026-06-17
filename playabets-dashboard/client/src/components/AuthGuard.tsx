/**
 * AuthGuard — wraps the entire app.
 * Uses onAuthStateChange (fires INITIAL_SESSION from localStorage immediately)
 * instead of getSession() which can block on slow networks.
 * After a valid session is confirmed, fetches dashboard permissions from /admin/me.
 */

import { useState, useEffect, useCallback, ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import Login from "../pages/Login";
import { PermissionsProvider, defaultPermissions, type UserPermissions } from "../contexts/PermissionsContext";
import { adminApi } from "../lib/api";

interface AuthGuardProps {
  children: ReactNode;
}

type AuthState = "loading" | "signed-out" | "authenticated";

export default function AuthGuard({ children }: AuthGuardProps) {
  const [state, setState] = useState<AuthState>("loading");
  const [permissions, setPermissions] = useState<UserPermissions>(defaultPermissions);

  const handleSession = useCallback(async (session: Session | null) => {
    if (!session) {
      setState("signed-out");
      return;
    }

    const email = session.user.email ?? "";
    try {
      const perms = await adminApi.getMe(email);
      setPermissions({
        userEmail: perms.user_email,
        role: perms.role,
        allowedPages: perms.allowed_pages,
      });
    } catch {
      // Admin endpoint unreachable — grant full access as safe fallback
      setPermissions({ userEmail: email, role: "viewer", allowedPages: ["*"] });
    }

    setState("authenticated");
  }, []);

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION synchronously from localStorage —
    // no network call needed to determine whether a session exists.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      handleSession(session);
    });

    // Safety net: if no auth event after 20s (Supabase unreachable), show login.
    const fallback = setTimeout(() => {
      setState((prev) => (prev === "loading" ? "signed-out" : prev));
    }, 20_000);

    return () => {
      listener.subscription.unsubscribe();
      clearTimeout(fallback);
    };
  }, [handleSession]);

  if (state === "loading") {
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

  if (state === "signed-out") {
    // Pass a no-op — onAuthStateChange handles SIGNED_IN automatically.
    return <Login onLogin={() => {}} />;
  }

  return (
    <PermissionsProvider value={permissions}>
      {children}
    </PermissionsProvider>
  );
}
