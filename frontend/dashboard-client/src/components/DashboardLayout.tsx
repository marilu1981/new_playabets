/**
 * PLAYA BETS ANALYTICS DASHBOARD
 * DashboardLayout — Savanna Gold design system
 * Fixed 240px sidebar + top bar + main content area
 */

import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Users,
  TrendingUp,
  DollarSign,
  Gift,
  Gamepad2,
  Award,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Bell,
  Calendar,
  Menu,
  X,
  Activity,
  Network,
} from "lucide-react";
import { cn } from "@/lib/utils";

const SIDEBAR_BG = "https://private-us-east-1.manuscdn.com/sessionFile/cKq6wfrB6w3tj51hFB9kbf/sandbox/bUQudPFuU0QLod3pzEsnEY-img-1_1771727906000_na1fn_cGxheWFiZXRzLXNpZGViYXItYmc.png?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvY0txNndmckI2dzN0ajUxaEZCOWtiZi9zYW5kYm94L2JVUXVkUEZ1VTBRTG9kM3B6RXNuRVktaW1nLTFfMTc3MTcyNzkwNjAwMF9uYTFmbl9jR3hoZVdGaVpYUnpMWE5wWkdWaVlYSXRZbWMucG5nP3gtb3NzLXByb2Nlc3M9aW1hZ2UvcmVzaXplLHdfMTkyMCxoXzE5MjAvZm9ybWF0LHdlYnAvcXVhbGl0eSxxXzgwIiwiQ29uZGl0aW9uIjp7IkRhdGVMZXNzVGhhbiI6eyJBV1M6RXBvY2hUaW1lIjoxNzk4NzYxNjAwfX19XX0_&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=pA3ZsPLcJLMkqkREcWT7Rd9tENWAsrsx9Ru083kHTN4aFF5tN2T7jqaVZPKjBsWtApcwGBmct60iicQph7tC~NmVWsY3VQZDWMhIvCRTc~JzKnbOKqStYxb4aNbVbnwi2aD3OkcOl8RoOb7N-WPikZ618dX699qOzcBxJvcV2w-yFcegNZnzWfp5yyDkRRZaOcL5q244vfRhWpDV-ge-IOl-E-wg80lUuDO-fsvkoTMRVfjMeZQsVApScGPyFz102jRAD3H8fHiZRQ1mMmnyLxy25Lfxib4AfxFAiG8zS6H-wh9RbIPOUE~QPf2FgmELJWYVznZUEetqzaP869oijA__";

const navGroups = [
  {
    label: "Overview",
    items: [
      { path: "/", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Operations",
    items: [
      { path: "/users", label: "Users & Players", icon: Users },
      { path: "/betting", label: "Betting & Events", icon: TrendingUp },
      { path: "/transactions", label: "Transactions", icon: DollarSign },
    ],
  },
  {
    label: "Products",
    items: [
      { path: "/bonus", label: "Bonus & Campaigns", icon: Gift },
      { path: "/casino", label: "Casino & Games", icon: Gamepad2 },
      { path: "/commissions", label: "Commissions", icon: Award },
    ],
  },
  {
    label: "Governance",
    items: [
      { path: "/compliance", label: "Compliance & Audit", icon: ShieldCheck },
      { path: "/hierarchy", label: "Hierarchy & Roles", icon: Network },
    ],
  },
];

interface DashboardLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}

export default function DashboardLayout({ children, title, subtitle }: DashboardLayoutProps) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

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
          background: `linear-gradient(180deg, oklch(0.14 0.05 155) 0%, oklch(0.12 0.04 155) 100%)`,
          borderRight: "1px solid oklch(1 0 0 / 6%)",
        }}
      >
        {/* Background texture */}
        <div
          className="absolute inset-0 opacity-10 bg-cover bg-center pointer-events-none"
          style={{ backgroundImage: `url(${SIDEBAR_BG})` }}
        />

        {/* Logo area */}
        <div className="relative flex items-center gap-3 px-4 py-5 border-b border-white/5">
          <div
            className="flex-shrink-0 w-8 h-8 rounded flex items-center justify-center text-sm font-bold"
            style={{ background: "oklch(0.72 0.14 85)", color: "oklch(0.12 0.04 155)" }}
          >
            PB
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
                PLAYA <span style={{ color: "oklch(0.72 0.14 85)" }}>BETS</span>
              </div>
              <div className="text-xs text-white/40 leading-tight">Analytics Platform</div>
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
                  const Icon = item.icon;
                  return (
                    <Link key={item.path} href={item.path}>
                      <div
                        className={cn(
                          "flex items-center gap-3 px-2 py-2 rounded text-sm transition-all duration-150 cursor-pointer group",
                          isActive
                            ? "nav-active text-white"
                            : "text-white/50 hover:text-white/80 hover:bg-white/5"
                        )}
                      >
                        <Icon
                          size={16}
                          className={cn(
                            "flex-shrink-0 transition-colors",
                            isActive ? "text-gold" : "text-white/40 group-hover:text-white/70"
                          )}
                          style={isActive ? { color: "oklch(0.72 0.14 85)" } : {}}
                        />
                        {!collapsed && (
                          <span className="truncate font-medium">{item.label}</span>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="relative border-t border-white/5 px-3 py-3">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-xs text-white/60">
                A
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-white/70 truncate">Admin User</div>
                <div className="text-xs text-white/30 truncate">Playa Bets</div>
              </div>
              <Activity size={14} className="text-white/30 flex-shrink-0" />
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header
          className="flex items-center gap-4 px-6 py-3 border-b"
          style={{ borderColor: "oklch(1 0 0 / 6%)", background: "oklch(0.16 0.04 155)" }}
        >
          {/* Mobile menu button */}
          <button
            className="lg:hidden text-white/50 hover:text-white/80"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          {/* Page title */}
          <div className="flex-1 min-w-0">
            {title && (
              <h1
                className="text-lg font-bold text-white leading-tight truncate"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                {title}
              </h1>
            )}
            {subtitle && (
              <p className="text-xs text-white/40 truncate">{subtitle}</p>
            )}
          </div>

          {/* Top bar right */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-white/40">
              <Calendar size={12} />
              <span>{today}</span>
            </div>
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium"
              style={{ background: "oklch(0.62 0.17 145 / 15%)", color: "oklch(0.75 0.17 145)" }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
              Live
            </div>
            <button className="relative text-white/40 hover:text-white/70 transition-colors">
              <Bell size={18} />
              <span
                className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full text-xs flex items-center justify-center"
                style={{ background: "oklch(0.72 0.14 85)", color: "oklch(0.12 0.04 155)", fontSize: "9px" }}
              >
                3
              </span>
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
