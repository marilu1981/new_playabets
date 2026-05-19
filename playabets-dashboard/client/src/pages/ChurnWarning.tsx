import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import KpiCard from "@/components/KpiCard";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from "recharts";
import { AlertTriangle, ShieldAlert, Users, TrendingDown, Activity } from "lucide-react";
import { cachedFetch } from "@/lib/apiCache";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/+$/, "");
async function fetchJson<T>(path: string): Promise<T> {
  return cachedFetch<T>(`${API_BASE_URL}${path}`);
}

const TIER_COLORS: Record<string, string> = {
  Critical: "#d94040",
  High:     "#ff7a00",
  Moderate: "#ffb500",
  Low:      "#7ab800",
};

const SEGMENT_ORDER = ["VIP", "Active", "New", "Cooling", "Lapsed", "Dormant"];

const CARD_BG = { background: "#ffffff", border: "1px solid #dde8dd", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" };
const TT_STYLE = { background: "#fff", border: "1px solid #e4ece4", fontSize: 11 };

interface TierCounts { Critical: number; High: number; Moderate: number; Low: number; }
interface SegBreakdown { segment: string; risk_tier: string; count: number; }
interface AvgScores { risk_score: number; fc_score: number; bil_score: number; oi_score: number; }
interface RiskSummary {
  has_data: boolean;
  tiers: TierCounts;
  total_users: number;
  segment_breakdown?: SegBreakdown[];
  avg_scores?: AvgScores;
}

interface Player {
  userid: number;
  segment?: string;
  risk_tier: string;
  risk_score: number;
  fc_score?: number;
  bil_score?: number;
  oi_score?: number;
  bets_30d?: number;
  casino_bets_30d?: number;
  sessions_30d?: number;
  net_cashflow_30d?: number;
  balance_raw?: number;
  loss_rate_30d?: number;
  max_losing_streak_30d?: number;
  self_exclusion_flag?: boolean;
}

const ACTIVE_TIERS = ["Critical", "High"] as const;

export default function ChurnWarningPage() {
  const [summary, setSummary]     = useState<RiskSummary | null>(null);
  const [players, setPlayers]     = useState<Player[]>([]);
  const [activeTier, setActiveTier] = useState<string>("Critical");
  const [loading, setLoading]     = useState(true);
  const [tableLoading, setTableLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchJson<RiskSummary>("/rfm/risk").then(d => {
      setSummary(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    setTableLoading(true);
    fetchJson<{ players: Player[]; total: number }>(`/rfm/risk/players?tier=${activeTier}&limit=200`)
      .then(d => { setPlayers(d.players); setTableLoading(false); })
      .catch(() => setTableLoading(false));
  }, [activeTier]);

  const tiers = summary?.tiers ?? { Critical: 0, High: 0, Moderate: 0, Low: 0 };
  const total = summary?.total_users ?? 0;
  const criticalPct = total > 0 ? ((tiers.Critical / total) * 100).toFixed(1) : "—";
  const highPct     = total > 0 ? (((tiers.Critical + tiers.High) / total) * 100).toFixed(1) : "—";

  // Pie data
  const pieData = Object.entries(tiers).map(([name, value]) => ({ name, value }));

  // Segment × tier stacked bar
  const segData: Record<string, Record<string, number>> = {};
  (summary?.segment_breakdown ?? []).forEach(r => {
    if (!segData[r.segment]) segData[r.segment] = {};
    segData[r.segment][r.risk_tier] = r.count;
  });
  const barData = SEGMENT_ORDER
    .filter(s => segData[s])
    .map(s => ({ segment: s, ...segData[s] }));

  const fmt = (n: number | undefined) => n == null ? "—" : n.toLocaleString();
  const fmtPct = (n: number | undefined) => n == null ? "—" : `${(n * 100).toFixed(0)}%`;
  const fmtScore = (n: number | undefined) => n == null ? "—" : n.toFixed(3);

  return (
    <DashboardLayout title="Churn Warning" subtitle="SocioTopography risk model — 3-axis churn prediction">

      {/* KPI Row */}
      <div className="rounded-xl p-5 mb-6" style={CARD_BG}>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <KpiCard title="Critical Risk"  value={loading ? "…" : tiers.Critical.toLocaleString()} icon={<ShieldAlert size={18} />} accent="red"   loading={loading} />
          <KpiCard title="High Risk"      value={loading ? "…" : tiers.High.toLocaleString()}     icon={<AlertTriangle size={18} />} accent="red"  loading={loading} />
          <KpiCard title="Moderate Risk"  value={loading ? "…" : tiers.Moderate.toLocaleString()} icon={<Activity size={18} />}     accent="amber" loading={loading} />
          <KpiCard title="Low Risk"       value={loading ? "…" : tiers.Low.toLocaleString()}       icon={<Users size={18} />}        accent="green" loading={loading} />
          <KpiCard title="Critical %"     value={loading ? "…" : `${criticalPct}%`}               icon={<TrendingDown size={18} />} accent="red"   loading={loading} />
          <KpiCard title="High+ %"        value={loading ? "…" : `${highPct}%`}                   icon={<TrendingDown size={18} />} accent="amber" loading={loading} />
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">

        {/* Tier pie */}
        <div className="rounded-xl p-5" style={CARD_BG}>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">Risk Tier Distribution</h3>
          <p className="text-xs text-gray-400 mb-4">All {total.toLocaleString()} scored users</p>
          {!loading && pieData.some(d => d.value > 0) ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2}>
                  {pieData.map(entry => (
                    <Cell key={entry.name} fill={TIER_COLORS[entry.name] ?? "#aaa"} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TT_STYLE} formatter={(v: number) => v.toLocaleString()} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-xs text-gray-400">
              {loading ? "Loading…" : "No data"}
            </div>
          )}
        </div>

        {/* Segment × tier stacked bar */}
        <div className="lg:col-span-2 rounded-xl p-5" style={CARD_BG}>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">Risk Tier by RFM Segment</h3>
          <p className="text-xs text-gray-400 mb-4">How churn risk concentrates across player segments</p>
          {!loading && barData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="segment" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))} axisLine={false} tickLine={false} width={45} />
                <Tooltip contentStyle={TT_STYLE} formatter={(v: number) => v.toLocaleString()} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {Object.keys(TIER_COLORS).map(tier => (
                  <Bar key={tier} dataKey={tier} stackId="a" fill={TIER_COLORS[tier]} name={tier} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-xs text-gray-400">
              {loading ? "Loading…" : "No data"}
            </div>
          )}
        </div>
      </div>

      {/* Axis score summary */}
      {summary?.avg_scores && (
        <div className="rounded-xl p-5 mb-6" style={CARD_BG}>
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Average Axis Scores (all users)</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "FC Score (Financial Capacity)", key: "fc_score", note: "Low FC → higher risk" },
              { label: "BIL Score (Behavioral Intensity)", key: "bil_score", note: "High intensity → higher risk" },
              { label: "OI Score (Outcome Instability)", key: "oi_score", note: "High volatility → higher risk" },
              { label: "Composite Risk Score", key: "risk_score", note: "0 = no risk, 1 = max risk" },
            ].map(({ label, key, note }) => (
              <div key={key} className="rounded-lg p-3" style={{ background: "#f5f9f5", border: "1px solid #dde8dd" }}>
                <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">{label}</div>
                <div className="text-sm font-bold text-gray-900">{fmtScore(summary.avg_scores![key as keyof AvgScores])}</div>
                <div className="text-[9px] text-gray-400 mt-1">{note}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Player table */}
      <div className="rounded-xl p-5" style={CARD_BG}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">At-Risk Players</h3>
            <p className="text-xs text-gray-400">Top 200 by risk score in selected tier</p>
          </div>
          <div className="flex gap-2">
            {ACTIVE_TIERS.map(t => (
              <button
                key={t}
                onClick={() => setActiveTier(t)}
                className="px-3 py-1 rounded-md text-xs font-semibold transition-colors"
                style={{
                  background: activeTier === t ? TIER_COLORS[t] : "#f5f9f5",
                  color:      activeTier === t ? "#fff" : "#555",
                  border:     `1px solid ${activeTier === t ? TIER_COLORS[t] : "#dde8dd"}`,
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {tableLoading ? (
          <div className="text-center text-xs text-gray-400 py-10">Loading…</div>
        ) : players.length === 0 ? (
          <div className="text-center text-xs text-gray-400 py-10">No players in this tier</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  {["User ID", "Segment", "Risk", "Score", "FC", "BIL", "OI", "Bets 30d", "Sessions", "Net Cash", "Loss %", "Streak", "Self-Ex"].map(h => (
                    <th key={h} className="text-left pb-2 pr-4 text-[9px] font-bold uppercase tracking-widest text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {players.map((p, i) => (
                  <tr key={p.userid} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                    <td className="py-1.5 pr-4 font-mono text-gray-700">{p.userid}</td>
                    <td className="py-1.5 pr-4">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold" style={{ background: "#e8f5e9", color: "#2e7d32" }}>
                        {p.segment ?? "—"}
                      </span>
                    </td>
                    <td className="py-1.5 pr-4">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold text-white" style={{ background: TIER_COLORS[p.risk_tier] ?? "#aaa" }}>
                        {p.risk_tier}
                      </span>
                    </td>
                    <td className="py-1.5 pr-4 font-semibold text-gray-800">{fmtScore(p.risk_score)}</td>
                    <td className="py-1.5 pr-4 text-gray-600">{fmtScore(p.fc_score)}</td>
                    <td className="py-1.5 pr-4 text-gray-600">{fmtScore(p.bil_score)}</td>
                    <td className="py-1.5 pr-4 text-gray-600">{fmtScore(p.oi_score)}</td>
                    <td className="py-1.5 pr-4 text-gray-600">{fmt(p.bets_30d)}</td>
                    <td className="py-1.5 pr-4 text-gray-600">{fmt(p.sessions_30d)}</td>
                    <td className="py-1.5 pr-4 text-gray-600">{p.net_cashflow_30d == null ? "—" : `R${p.net_cashflow_30d < 0 ? "-" : ""}${Math.abs(p.net_cashflow_30d).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}</td>
                    <td className="py-1.5 pr-4 text-gray-600">{fmtPct(p.loss_rate_30d)}</td>
                    <td className="py-1.5 pr-4 text-gray-600">{fmt(p.max_losing_streak_30d)}</td>
                    <td className="py-1.5 pr-4">
                      {p.self_exclusion_flag
                        ? <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-red-100 text-red-700">YES</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
