import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, LayoutDashboard, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  brandOptions,
  territoryOptions,
  countryOptions,
  trafficSourceOptions,
} from "@/data/dashboardData";
import headerLogo from "@/assets/header_logo.webp";
import iconHome from "@/assets/iconHome.webp";

interface DashboardSidebarProps {
  granularity: string;
  onGranularityChange: (val: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

const DashboardSidebar = ({
  granularity,
  onGranularityChange,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onMobileClose,
}: DashboardSidebarProps) => {
  const [fromDate, setFromDate] = useState<Date>(new Date(2026, 1, 1));
  const [toDate, setToDate] = useState<Date>(new Date(2026, 1, 14));

  const sidebarContent = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
        <img src={headerLogo} alt="PlayaBets" className="h-8 brightness-0 invert" />
        <button
          onClick={() => { onToggleCollapse(); onMobileClose(); }}
          className="p-1.5 rounded-md hover:bg-sidebar-accent transition-colors hidden md:block"
        >
          <ChevronLeft className="h-5 w-5 text-sidebar-foreground" />
        </button>
        <button
          onClick={onMobileClose}
          className="p-1.5 rounded-md hover:bg-sidebar-accent transition-colors md:hidden"
        >
          <X className="h-5 w-5 text-sidebar-foreground" />
        </button>
      </div>

      {/* Nav */}
      <div className="px-4 py-3 border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-sidebar-accent text-sidebar-accent-foreground">
          <LayoutDashboard className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Dashboard</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <p className="text-xs font-bold uppercase tracking-widest text-sidebar-muted">Filters</p>

        <FilterGroup label="Date Range">
          <DatePicker label="From" date={fromDate} onSelect={(d) => d && setFromDate(d)} />
          <DatePicker label="To" date={toDate} onSelect={(d) => d && setToDate(d)} />
        </FilterGroup>

        <FilterGroup label="View Granularity">
          <div className="flex rounded-md overflow-hidden border border-sidebar-border">
            {["Daily", "Weekly", "Monthly"].map((g) => (
              <button
                key={g}
                onClick={() => onGranularityChange(g)}
                className={cn(
                  "flex-1 py-1.5 text-xs font-semibold transition-colors",
                  granularity === g
                    ? "bg-primary text-primary-foreground"
                    : "bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-border"
                )}
              >
                {g}
              </button>
            ))}
          </div>
        </FilterGroup>

        <FilterSelect label="Brand" options={brandOptions} />
        <FilterSelect label="Territory" options={territoryOptions} />
        <FilterSelect label="Customer Country" options={countryOptions} />
        <FilterSelect label="Traffic Source" options={trafficSourceOptions} />

        <FilterGroup label="Affiliate ID">
          <input
            type="text"
            placeholder="Enter affiliate ID..."
            className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-sm text-sidebar-accent-foreground placeholder:text-sidebar-muted focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </FilterGroup>
      </div>

    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col shrink-0 min-h-screen bg-sidebar border-r border-sidebar-border transition-all duration-200"
        style={{ width: collapsed ? 64 : 288 }}
      >
        {collapsed ? (
          <div className="flex flex-col items-center py-4 gap-4 h-full">
            <button onClick={onToggleCollapse} className="p-2 rounded-md hover:bg-sidebar-accent transition-colors">
              <ChevronRight className="h-5 w-5 text-sidebar-foreground" />
            </button>
            <img src={iconHome} alt="Home" className="h-6 w-6 opacity-70 mt-4" />
            <LayoutDashboard className="h-5 w-5 text-primary mt-2" />
          </div>
        ) : sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-foreground/50" onClick={onMobileClose} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-sidebar flex flex-col animate-fade-in">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
};

const FilterGroup = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-2">
    <p className="text-xs font-semibold text-sidebar-foreground">{label}</p>
    {children}
  </div>
);

const FilterSelect = ({ label, options }: { label: string; options: string[] }) => (
  <FilterGroup label={label}>
    <Select defaultValue={options[0]}>
      <SelectTrigger className="w-full bg-sidebar-accent border-sidebar-border text-sidebar-accent-foreground text-sm h-9">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt} value={opt}>
            {opt}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </FilterGroup>
);

const DatePicker = ({
  label,
  date,
  onSelect,
}: {
  label: string;
  date: Date;
  onSelect: (d: Date | undefined) => void;
}) => (
  <Popover>
    <PopoverTrigger asChild>
      <Button
        variant="outline"
        className="w-full justify-start text-left text-sm bg-sidebar-accent border-sidebar-border text-sidebar-accent-foreground h-9"
      >
        <CalendarIcon className="mr-2 h-4 w-4 opacity-50" />
        {label}: {format(date, "dd MMM yyyy")}
      </Button>
    </PopoverTrigger>
    <PopoverContent className="w-auto p-0" align="start">
      <Calendar
        mode="single"
        selected={date}
        onSelect={onSelect}
        initialFocus
        className={cn("p-3 pointer-events-auto")}
      />
    </PopoverContent>
  </Popover>
);

export default DashboardSidebar;
