export const kpiData = {
  registrations: { value: 12_847, change: 14.2, trend: "up" as const },
  ftds: { value: 3_291, change: 8.7, trend: "up" as const },
  actives: { value: 45_632, change: -0.3, trend: "neutral" as const },
};

export const revenueData = [
  { date: "Week 1", ggr: 420000, ngr: 380000, turnover: 1250000 },
  { date: "Week 2", ggr: 460000, ngr: 410000, turnover: 1320000 },
  { date: "Week 3", ggr: 390000, ngr: 350000, turnover: 1180000 },
  { date: "Week 4", ggr: 510000, ngr: 470000, turnover: 1450000 },
  { date: "Week 5", ggr: 480000, ngr: 430000, turnover: 1380000 },
  { date: "Week 6", ggr: 530000, ngr: 490000, turnover: 1520000 },
  { date: "Week 7", ggr: 470000, ngr: 420000, turnover: 1340000 },
  { date: "Week 8", ggr: 560000, ngr: 510000, turnover: 1600000 },
];

export const playerAcquisitionData = [
  { month: "Sep", registrations: 9800, ftds: 2400 },
  { month: "Oct", registrations: 10500, ftds: 2700 },
  { month: "Nov", registrations: 11200, ftds: 2900 },
  { month: "Dec", registrations: 13100, ftds: 3500 },
  { month: "Jan", registrations: 11800, ftds: 3100 },
  { month: "Feb", registrations: 12847, ftds: 3291 },
];

export const segmentData = [
  { name: "VIP", value: 8, fill: "hsl(82, 100%, 36%)" },
  { name: "PVIP", value: 15, fill: "hsl(0, 0%, 20%)" },
  { name: "Mass", value: 62, fill: "hsl(220, 5%, 46%)" },
  { name: "Mix", value: 15, fill: "hsl(42, 100%, 50%)" },
];

export const brandOptions = ["All Brands", "PlayaBets", "PlayaCasino", "PlayaLotto"];
export const territoryOptions = ["All Territories", "South Africa", "Nigeria", "Kenya", "Ghana"];
export const countryOptions = ["All Countries", "South Africa", "Nigeria", "Kenya", "Ghana", "Tanzania"];
export const trafficSourceOptions = ["All Sources", "Organic", "Paid", "Social", "Referral", "Direct"];
