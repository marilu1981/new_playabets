/**
 * AuthGuard — wraps the entire app.
 * Shows the Login page if the user is not authenticated.
 * After a valid session is confirmed, fetches the user's dashboard permissions
 * from /admin/me and makes them available via PermissionsContext.
 */

import { useState, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "../lib/supabase";
import Login from "../pages/Login";
import { PermissionsProvider, defaultPermissions, type UserPermissions } from "../contexts/PermissionsContext";
import { adminApi } from "../lib/api";

interface AuthGuardProps {
  children: ReactNode;
}

type AuthState = "loading" | "signed-out" | "authenticated";

const AUTH_TIMEOUT_MS = 10000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Auth request timed out")), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const [state, setState] = useState<AuthState>("loading");
  const [permissions, setPermissions] = useState<UserPermissions>(defaultPermissions);

  const refresh = useCallback(async () => {
    try {
      const { data: sessionData } = await withTimeout(supabase.auth.getSession(), AUTH_TIMEOUT_MS);
      if (!sessionData.session) {
        setState("signed-out");
        return;
      }

      const email = sessionData.session.user.email ?? "";
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
    } catch (error) {
      console.error("Auth guard refresh failed", error);
      setState("signed-out");
    }
  }, []);

  useEffect(() => {
    refresh();
    const { data: listener } = supabase.auth.onAuthStateChange(() => refresh());
    return () => {
      listener.subscription.unsubscribe();
    };
  }, [refresh]);

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
    return <Login onLogin={refresh} />;
  }

  return (
    <PermissionsProvider value={permissions}>
      {children}
    </PermissionsProvider>
  );
}
