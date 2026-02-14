export interface MetricRow {
  metric: string;
  currentPeriod: string;
  previousPeriod: string;
  change: string;
  ytd: string;
}

export const overviewMetrics: MetricRow[] = [
  { metric: "Registrations", currentPeriod: "12,847", previousPeriod: "11,246", change: "+14.2%", ytd: "24,093" },
  { metric: "FTDs", currentPeriod: "3,291", previousPeriod: "3,028", change: "+8.7%", ytd: "6,319" },
  { metric: "V_FTDs", currentPeriod: "1,842", previousPeriod: "1,610", change: "+14.4%", ytd: "3,452" },
  { metric: "Top_FTDs", currentPeriod: "487", previousPeriod: "487", change: "0%", ytd: "974" },
  { metric: "Conversion Rate", currentPeriod: "25.6%", previousPeriod: "26.9%", change: "+4.8%", ytd: "26.2%" },
  { metric: "Actives", currentPeriod: "45,632", previousPeriod: "45,769", change: "-0.3%", ytd: "91,401" },
  { metric: "Total GGR", currentPeriod: "R1,860,000", previousPeriod: "R1,690,000", change: "+10.1%", ytd: "R3,550,000" },
  { metric: "NGR", currentPeriod: "R1,710,000", previousPeriod: "R1,540,000", change: "+11.0%", ytd: "R3,250,000" },
  { metric: "Profit %", currentPeriod: "34.2%", previousPeriod: "31.8%", change: "+7.5%", ytd: "33.0%" },
];

export const sportMetrics: MetricRow[] = [
  { metric: "Sport Registrations", currentPeriod: "7,108", previousPeriod: "6,340", change: "+12.1%", ytd: "13,448" },
  { metric: "Sport FTDs", currentPeriod: "1,823", previousPeriod: "1,690", change: "+7.9%", ytd: "3,513" },
  { metric: "Sport Actives", currentPeriod: "28,410", previousPeriod: "28,920", change: "-1.8%", ytd: "57,330" },
  { metric: "Sport Turnover", currentPeriod: "R4,250,000", previousPeriod: "R3,980,000", change: "+6.8%", ytd: "R8,230,000" },
  { metric: "Sport GGR", currentPeriod: "R980,000", previousPeriod: "R870,000", change: "+12.6%", ytd: "R1,850,000" },
  { metric: "Sport NGR", currentPeriod: "R890,000", previousPeriod: "R790,000", change: "+12.7%", ytd: "R1,680,000" },
  { metric: "Sport Margin %", currentPeriod: "23.1%", previousPeriod: "21.9%", change: "+5.5%", ytd: "22.5%" },
  { metric: "Avg Bet", currentPeriod: "R42.50", previousPeriod: "R39.80", change: "+6.8%", ytd: "R41.15" },
  { metric: "Bets Per Active", currentPeriod: "14.2", previousPeriod: "13.8", change: "+2.9%", ytd: "14.0" },
];

export const casinoMetrics: MetricRow[] = [
  { metric: "Casino Registrations", currentPeriod: "5,739", previousPeriod: "4,906", change: "+17.0%", ytd: "10,645" },
  { metric: "Casino FTDs", currentPeriod: "1,468", previousPeriod: "1,338", change: "+9.7%", ytd: "2,806" },
  { metric: "Casino Actives", currentPeriod: "17,222", previousPeriod: "16,849", change: "+2.2%", ytd: "34,071" },
  { metric: "Casino Turnover", currentPeriod: "R8,900,000", previousPeriod: "R8,120,000", change: "+9.6%", ytd: "R17,020,000" },
  { metric: "Casino GGR", currentPeriod: "R880,000", previousPeriod: "R820,000", change: "+7.3%", ytd: "R1,700,000" },
  { metric: "Casino NGR", currentPeriod: "R820,000", previousPeriod: "R750,000", change: "+9.3%", ytd: "R1,570,000" },
  { metric: "Casino Margin %", currentPeriod: "9.9%", previousPeriod: "10.1%", change: "-2.0%", ytd: "10.0%" },
  { metric: "Avg Spin Value", currentPeriod: "R8.20", previousPeriod: "R7.90", change: "+3.8%", ytd: "R8.05" },
  { metric: "Spins Per Active", currentPeriod: "63.4", previousPeriod: "61.1", change: "+3.8%", ytd: "62.3" },
];

export const allMetrics: MetricRow[] = [
  ...overviewMetrics,
  ...sportMetrics.filter(m => !overviewMetrics.some(o => o.metric === m.metric)),
  ...casinoMetrics.filter(m => !overviewMetrics.some(o => o.metric === m.metric)),
];
