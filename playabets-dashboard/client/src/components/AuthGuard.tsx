/**
 * AuthGuard — wraps the entire app.
 * Shows the Login page if the user is not authenticated.
 * Enforces mandatory TOTP 2FA: accounts without a verified factor are
 * routed to enrollment; accounts with a factor must complete a challenge
 * each session before reaching the dashboard.
 */

import { useState, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "../lib/supabase";
import Login from "../pages/Login";
import MfaEnroll from "../pages/MfaEnroll";
import MfaChallenge from "../pages/MfaChallenge";

interface AuthGuardProps {
  children: ReactNode;
}

type AuthState = "loading" | "signed-out" | "needs-enroll" | "needs-challenge" | "authenticated";

export default function AuthGuard({ children }: AuthGuardProps) {
  const [state, setState] = useState<AuthState>("loading");

  const refresh = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setState("signed-out");
      return;
    }

    const { data: aal, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !aal) {
      setState("signed-out");
      return;
    }

    if (aal.currentLevel === "aal2") {
      setState("authenticated");
    } else if (aal.nextLevel === "aal2") {
      // Account has a verified MFA factor but this session hasn't completed the challenge
      setState("needs-challenge");
    } else {
      // No verified MFA factor enrolled yet — mandatory setup
      setState("needs-enroll");
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

  if (state === "needs-enroll") {
    return <MfaEnroll onComplete={refresh} />;
  }

  if (state === "needs-challenge") {
    return <MfaChallenge onComplete={refresh} />;
  }

  return <>{children}</>;
}
