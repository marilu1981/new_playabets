/**
 * PLAYA BETS ANALYTICS DASHBOARD
 * MFA Challenge - shown after password login for accounts with a
 * verified TOTP factor. Requires the 6-digit authenticator code.
 */

import { useEffect, useState, FormEvent } from "react";
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
  letterSpacing: "0.3em",
  textAlign: "center",
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

export default function MfaChallenge({ onComplete }: { onComplete: () => void }) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadFactor() {
      setLoading(true);
      const { data, error: listError } = await supabase.auth.mfa.listFactors();
      if (cancelled) return;

      if (listError || !data) {
        setError(listError?.message ?? "Could not load MFA factors.");
        setLoading(false);
        return;
      }
      const verified = data.totp.find((f) => f.status === "verified");
      if (!verified) {
        setError("No verified authenticator found. Please contact your administrator.");
        setLoading(false);
        return;
      }
      setFactorId(verified.id);
      setLoading(false);
    }

    loadFactor();
    return () => { cancelled = true; };
  }, []);

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setError(null);
    setVerifying(true);
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError || !challenge) {
        setError(challengeError?.message ?? "Could not create MFA challenge.");
        return;
      }
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: code.trim(),
      });
      if (verifyError) {
        setError("Invalid code. Please try again.");
        setCode("");
        return;
      }
      onComplete();
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: "oklch(0.115 0.035 155)" }}
    >
      <div className="mb-8 flex flex-col items-center gap-2">
        <div
          className="text-2xl font-bold text-white tracking-tight"
          style={FONT_SERIF}
        >
          PLAYA <span style={{ color: "oklch(0.72 0.14 85)" }}>Bets</span>
        </div>
        <div className="text-xs text-white/40 tracking-widest uppercase">
          Two-Factor Verification
        </div>
      </div>

      <div className="w-full max-w-sm" style={CARD_BG}>
        <div className="px-8 py-8">
          <h1 className="text-lg font-semibold text-white mb-1" style={FONT_SERIF}>
            Enter your code
          </h1>
          <p className="text-xs text-white/40 mb-6">
            Open your authenticator app and enter the 6-digit code for PlayaBets.
          </p>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div
                className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
                style={{ borderColor: "oklch(0.72 0.14 85)", borderTopColor: "transparent" }}
              />
            </div>
          ) : (
            <form onSubmit={handleVerify} className="flex flex-col gap-4">
              <div>
                <label
                  className="block text-xs font-semibold mb-1.5 uppercase tracking-wider"
                  style={{ color: "oklch(0.50 0.06 155)" }}
                >
                  6-digit code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  autoFocus
                  disabled={!factorId}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  style={INPUT_STYLE}
                  placeholder="000000"
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
                disabled={verifying || !factorId || code.length !== 6}
                style={{ ...BTN_STYLE, opacity: verifying || !factorId || code.length !== 6 ? 0.6 : 1 }}
              >
                {verifying ? "Verifying..." : "Verify"}
              </button>
            </form>
          )}

          <button
            type="button"
            onClick={() => supabase.auth.signOut()}
            className="w-full mt-4 text-xs text-white/30 hover:text-white/50 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
