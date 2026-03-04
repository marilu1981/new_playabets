/**
 * PLAYA BETS ANALYTICS DASHBOARD
 * Login Page — Supabase email/password authentication.
 * Invite-only: accounts are created by admin in Supabase dashboard.
 */

import { useState, FormEvent } from "react";
import { supabase } from "../lib/supabase";

const CARD_BG: React.CSSProperties = {
  background: "oklch(0.155 0.045 155)",
  border: "1px solid oklch(1 0 0 / 8%)",
  borderRadius: "16px",
};

const INPUT_STYLE: React.CSSProperties = {
  background: "oklch(0.19 0.04 155)",
  color: "oklch(0.85 0.005 65)",
  border: "1px solid oklch(1 0 0 / 14%)",
  borderRadius: "8px",
  padding: "10px 14px",
  fontSize: "14px",
  width: "100%",
  outline: "none",
  transition: "border-color 0.15s",
};

const BTN_STYLE: React.CSSProperties = {
  background: "oklch(0.72 0.14 85)",
  color: "oklch(0.12 0.04 155)",
  border: "none",
  borderRadius: "8px",
  padding: "11px 0",
  fontSize: "14px",
  fontWeight: 700,
  width: "100%",
  cursor: "pointer",
  transition: "opacity 0.15s",
  letterSpacing: "0.03em",
};

const FONT_SERIF: React.CSSProperties = {
  fontFamily: "'Playfair Display', 'Georgia', serif",
};

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authError) {
        setError(authError.message ?? "Invalid email or password.");
      } else {
        onLogin();
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: "oklch(0.115 0.035 155)" }}
    >
      {/* Logo */}
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="PlayaBets"
            className="h-10 w-auto"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
          <div>
            <div
              className="text-2xl font-bold text-white tracking-tight"
              style={FONT_SERIF}
            >
              PLAYA <span style={{ color: "oklch(0.72 0.14 85)" }}>Bets</span>
            </div>
            <div className="text-xs text-white/40 tracking-widest uppercase">
              Analytics Dashboard
            </div>
          </div>
        </div>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm" style={CARD_BG}>
        <div className="px-8 py-8">
          <h1
            className="text-lg font-semibold text-white mb-1"
            style={FONT_SERIF}
          >
            Sign in
          </h1>
          <p className="text-xs text-white/40 mb-6">
            Access is by invitation only. Contact your administrator for
            credentials.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label
                className="block text-xs font-semibold mb-1.5 uppercase tracking-wider"
                style={{ color: "oklch(0.50 0.06 155)" }}
              >
                Email
              </label>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={INPUT_STYLE}
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label
                className="block text-xs font-semibold mb-1.5 uppercase tracking-wider"
                style={{ color: "oklch(0.50 0.06 155)" }}
              >
                Password
              </label>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={INPUT_STYLE}
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div
                className="text-xs px-3 py-2 rounded"
                style={{
                  background: "oklch(0.55 0.22 25 / 12%)",
                  color: "oklch(0.70 0.18 25)",
                  border: "1px solid oklch(0.55 0.22 25 / 20%)",
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{ ...BTN_STYLE, opacity: loading ? 0.6 : 1 }}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>

      <p className="mt-6 text-xs text-white/20">
        © {new Date().getFullYear()} PlayaBets · Confidential
      </p>
    </div>
  );
}
