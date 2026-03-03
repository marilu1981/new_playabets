/**
 * PLAYA BETS ANALYTICS DASHBOARD
 * App.tsx — Routes & top-level layout
 * Design: Savanna Gold (dark forest green + warm gold)
 */

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

// Pages
import Home from "./pages/Home";
import UsersPage from "./pages/Users";
import BettingPage from "./pages/Betting";
import TransactionsPage from "./pages/Transactions";
import CasinoPage from "./pages/Casino";
import CommissionsPage from "./pages/Commissions";
import CompliancePage from "./pages/Compliance";
import HierarchyPage from "./pages/Hierarchy";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/users" component={UsersPage} />
      <Route path="/betting" component={BettingPage} />
      <Route path="/transactions" component={TransactionsPage} />
      <Route path="/casino" component={CasinoPage} />
      <Route path="/commissions" component={CommissionsPage} />
      <Route path="/compliance" component={CompliancePage} />
      <Route path="/hierarchy" component={HierarchyPage} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
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
