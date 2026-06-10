/**
 * PLAYA BETS ANALYTICS DASHBOARD
 * DashboardLayout — Savanna Gold design system
 * Fixed 240px sidebar + top bar + main content area
 */

import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { supabase } from "../lib/supabase";
import { getLatestDataDate, getLastUpdated } from "@/lib/apiCache";
import {
  LayoutDashboard,
  Users,
  TrendingUp,
  DollarSign,
  BarChart2,
  ChevronLeft,
  ChevronRight,
  Bell,
  Calendar,
  Menu,
  X,
  Activity,
  LogOut,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Brand assets — local files in /public/brand/
const LOGO_FULL   = "/brand/logo-white.png";    // full horizontal logo, white — on dark Forest Leaf sidebar
const LOGO_ICON   = "/brand/icon-white.png";     // lion icon only, white — collapsed sidebar
const ICON_CASINO = "/brand/icon-dice-green.png"; // green dice — Casino nav
const ICON_BOLT   = "/brand/icon-bolt-green.png"; // green bolt — Bonus nav

// ── Sidebar footer with user info + sign out ─────────────────────────────────
function SidebarFooter({ collapsed }: { collapsed: boolean }) {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user?.email ?? null);
    });
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const initials = email ? email[0].toUpperCase() : "A";

  return (
    <div className="relative border-t border-white/5 px-3 py-3">
      <div className="flex items-center gap-2">
        <div
          className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold"
          style={{ background: "rgba(122, 184, 0, 0.2)", color: "#7ab800" }}
        >
          {initials}
        </div>
        {!collapsed && (
          <>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-white/70 truncate">
                {email ?? "Admin"}
              </div>
              <div className="text-xs text-white/30 truncate">Playa Bets</div>
            </div>
            <button
              onClick={handleSignOut}
              title="Sign out"
              className="text-white/30 hover:text-white/70 transition-colors flex-shrink-0"
            >
              <LogOut size={14} />
            </button>
          </>
        )}
        {collapsed && (
          <button
            onClick={handleSignOut}
            title="Sign out"
            className="text-white/30 hover:text-white/70 transition-colors"
          >
            <LogOut size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

// Nav item type supports either a lucide icon or an image URL
type NavItem = {
  path: string;
  label: string;
  icon?: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  imgIcon?: string;
  disabled?: boolean;
};

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Overview",
    items: [
      { path: "/", label: "Dashboard", icon: LayoutDashboard },
      { path: "/crm", label: "CRM Dashboard", icon: Users },
      { path: "/vip", label: "VIP Portfolio", icon: ShieldAlert },
      { path: "/product", label: "Product Dashboard", icon: BarChart2 },
    ],
  },
  {
    label: "Operations",
    items: [
      { path: "/users", label: "Players Breakdown", icon: Users },
      { path: "/betting", label: "Betting & Events", icon: TrendingUp },
      { path: "/transactions", label: "Transactions", icon: DollarSign },
    ],
  },
  {
    label: "Products",
    items: [
      { path: "/casino", label: "Casino & Games", imgIcon: ICON_CASINO },
      { path: "/bonus", label: "Bonus & Campaigns", imgIcon: ICON_BOLT },
    ],
  },
];

interface DashboardLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  filtersBar?: React.ReactNode;
}

export default function DashboardLayout({ children, title, subtitle, filtersBar }: DashboardLayoutProps) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const [lastDataDate, setLastDataDate] = useState<string | null>(() => getLatestDataDate());
  const [lastUpdated, setLastUpdatedState] = useState<string | null>(() => getLastUpdated());
  useEffect(() => {
    // Poll frequently so the timestamp appears as soon as useHomeData fetches /kpis/latest
    const id = setInterval(() => {
      setLastDataDate(getLatestDataDate());
      setLastUpdatedState(getLastUpdated());
    }, 2_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:relative z-50 flex flex-col h-full transition-all duration-300 ease-in-out",
          collapsed ? "w-16" : "w-60",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
        style={{
          background: "#111827",
          borderRight: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {/* Logo area */}
        <div className="relative flex items-center gap-2 px-3 py-4 border-b border-white/10">
          {collapsed ? (
            // Collapsed: lion icon only (white, visible on gradient)
            <div className="flex-1 flex items-center justify-center">
              <img
                src={LOGO_ICON}
                alt="Playa Bets"
                className="h-8 w-auto object-contain"
              />
            </div>
          ) : (
            // Expanded: full black logo — legible on the Playa Green top of gradient
            <div className="flex-1 min-w-0 flex items-center">
              <img
                src={LOGO_FULL}
                alt="Playa Bets"
                className="h-9 w-auto object-contain max-w-[160px]"
              />
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex flex-shrink-0 w-6 h-6 items-center justify-center rounded text-white/40 hover:text-white/80 hover:bg-white/5 transition-colors"
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="relative flex-1 overflow-y-auto py-4 px-2 space-y-4">
          {navGroups.map((group) => (
            <div key={group.label}>
              {!collapsed && (
                <div className="px-2 mb-1 text-xs font-semibold uppercase tracking-widest text-white/25">
                  {group.label}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = location === item.path;
                  const isDisabled = Boolean(item.disabled);
                  const Icon = item.icon;
                  const content = (
                    <div
                      className={cn(
                        "flex items-center gap-3 px-2 py-2 rounded text-sm transition-all duration-150 group",
                        isActive
                          ? "nav-active text-white"
                          : "text-white/50 hover:text-white/80 hover:bg-white/5",
                        isDisabled ? "opacity-40 cursor-not-allowed hover:text-white/50 hover:bg-transparent" : "cursor-pointer",
                      )}
                    >
                      {item.imgIcon ? (
                        <img
                          src={item.imgIcon}
                          alt={item.label}
                          className="flex-shrink-0 w-4 h-4 object-contain"
                          style={{
                            opacity: isActive ? 1 : 0.5,
                            transition: "opacity 0.15s",
                          }}
                        />
                      ) : Icon ? (
                        <Icon
                          size={16}
                          className={cn(
                            "flex-shrink-0 transition-colors",
                            isActive ? "text-gold" : "text-white/40 group-hover:text-white/70"
                          )}
                          style={isActive ? { color: "#7ab800" } : {}}
                        />
                      ) : null}
                      {!collapsed && (
                        <span className="truncate font-medium">{item.label}</span>
                      )}
                    </div>
                  );

                  if (isDisabled) {
                    return <div key={item.path}>{content}</div>;
                  }

                  return (
                    <Link key={item.path} href={item.path}>
                      {content}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <SidebarFooter collapsed={collapsed} />
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header
          className="flex items-center gap-4 px-6 py-3 border-b"
          style={{ borderColor: "#dde8dd", background: "#ffffff" }}
        >
          {/* Mobile menu button */}
          <button
            className="lg:hidden text-gray-500 hover:text-gray-800"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          {/* Page title */}
          <div className="flex-1 min-w-0">
            {title && (
              <h1
                className="text-lg font-bold text-gray-900 leading-tight truncate"
              >
                {title}
              </h1>
            )}
            {subtitle && (
              <p className="text-xs text-gray-500 truncate">{subtitle}</p>
            )}
          </div>

          {/* Top bar right */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="hidden lg:flex items-center gap-1.5 text-xs text-gray-400">
              <Calendar size={12} />
              <span>{today}</span>
            </div>
            {(lastUpdated || lastDataDate) && (
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <Activity size={11} style={{ color: "#7ab800" }} />
                <span>Last data: {lastUpdated ?? lastDataDate}</span>
              </div>
            )}
            <button className="relative text-gray-400 hover:text-gray-700 transition-colors">
              <Bell size={18} />
              <span
                className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full text-xs flex items-center justify-center"
                style={{ background: "#7ab800", color: "#000000", fontSize: "9px" }}
              >
                3
              </span>
            </button>
          </div>
        </header>

        {/* Filters bar slot — rendered between header and page content */}
        {filtersBar && filtersBar}

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
