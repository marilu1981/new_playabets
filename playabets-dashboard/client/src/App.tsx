/**
 * PLAYA BETS ANALYTICS DASHBOARD
 * App.tsx — Routes & top-level layout
 * Design: Savanna Gold (dark forest green + warm gold)
 *
 * Code-splitting: all pages are lazy-loaded so the initial bundle only
 * downloads the code needed for the current route.
 */
import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

// Lazy-loaded pages — each becomes a separate JS chunk
const Home             = lazy(() => import("./pages/Home"));
const UsersPage        = lazy(() => import("./pages/Users"));
const BettingPage      = lazy(() => import("./pages/Betting"));
const TransactionsPage = lazy(() => import("./pages/Transactions"));
const CasinoPage       = lazy(() => import("./pages/Casino"));
const CompliancePage   = lazy(() => import("./pages/Compliance"));
const HierarchyPage    = lazy(() => import("./pages/Hierarchy"));
const BonusPage        = lazy(() => import("./pages/Bonus"));
const NotFound         = lazy(() => import("./pages/NotFound"));

/** Minimal full-screen loading state shown while a page chunk loads */
function PageLoader() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "oklch(0.13 0.04 155)",
        color: "oklch(0.72 0.14 85)",
        fontFamily: "sans-serif",
        fontSize: 14,
        letterSpacing: "0.1em",
      }}
    >
      Loading…
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/"             component={Home} />
        <Route path="/users"        component={UsersPage} />
        <Route path="/betting"      component={BettingPage} />
        <Route path="/transactions" component={TransactionsPage} />
        <Route path="/casino"       component={CasinoPage} />
        <Route path="/bonus"        component={BonusPage} />
        <Route path="/compliance"   component={CompliancePage} />
        <Route path="/hierarchy"    component={HierarchyPage} />
        <Route path="/404"          component={NotFound} />
        <Route                      component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
