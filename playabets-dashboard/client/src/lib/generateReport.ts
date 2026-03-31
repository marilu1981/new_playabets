/**
 * PLAYA BETS — PDF Report Generator
 * Builds a downloadable executive analytics report using jsPDF.
 * Phase 1: template-based insights with real dashboard numbers.
 */

import jsPDF from "jspdf";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ReportData {
  // Period
  dateFrom: string;
  dateTo: string;
  dataDate: string | null;
  // Sportsbook
  totalBetslips: number;
  totalStake: number;
  totalWinnings: number;
  grossMargin: number;
  // Players
  registrations: number;
  ftds: number;
  activePlayersSports: number;
  activePlayersCasino: number;
  // RFM segments
  segments: Array<{ segment: string; count: number; pct: number }>;
  // Casino
  casinoGGR: number;
  casinoStake: number;
  casinoMargin: number;
  casinoProviderCount: number;
  // Transactions
  totalDeposits: number;
  totalWithdrawals: number;
  // Bonus
  bonusesCredited: number;
  freebetUsagePct: number;
  // Revenue
  ngr: number | null;
}

// ── Colours (PDF uses RGB) ────────────────────────────────────────────────────

const C = {
  darkBg:    [10, 32, 20]   as [number,number,number],
  midBg:     [18, 45, 28]   as [number,number,number],
  gold:      [201, 168, 76] as [number,number,number],
  green:     [76, 175, 127] as [number,number,number],
  white:     [255, 255, 255] as [number,number,number],
  lightGray: [200, 210, 205] as [number,number,number],
  dimText:   [140, 160, 148] as [number,number,number],
  bodyBg:    [248, 250, 249] as [number,number,number],
  rowAlt:    [240, 245, 242] as [number,number,number],
  border:    [220, 230, 225] as [number,number,number],
  darkText:  [25, 40, 30]   as [number,number,number],
  amber:     [210, 150, 60] as [number,number,number],
  red:       [200, 70, 70]  as [number,number,number],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fc(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}R ${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}R ${(abs / 1_000).toFixed(0)}K`;
  return `${sign}R ${abs.toFixed(0)}`;
}

function fnum(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

function fpct(n: number, d = 1): string {
  return `${n.toFixed(d)}%`;
}

function setFill(doc: jsPDF, rgb: [number,number,number]) {
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
}
function setDraw(doc: jsPDF, rgb: [number,number,number]) {
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
}
function setColor(doc: jsPDF, rgb: [number,number,number]) {
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}

// ── Page geometry ─────────────────────────────────────────────────────────────

const PW = 210; // A4 width mm
const PH = 297; // A4 height mm
const ML = 18;  // left margin
const MR = 18;  // right margin
const CW = PW - ML - MR; // content width

// ── Footer on every content page ──────────────────────────────────────────────

function addFooter(doc: jsPDF, pageNum: number, totalPages: number, dataDate: string | null) {
  const y = PH - 10;
  setFill(doc, C.darkBg);
  doc.rect(0, PH - 14, PW, 14, "F");
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  setColor(doc, C.dimText);
  doc.text("Playa Bets Analytics  ·  Confidential", ML, y);
  doc.text(`Data as of: ${dataDate ?? "—"}`, PW / 2, y, { align: "center" });
  doc.text(`Page ${pageNum} of ${totalPages}`, PW - MR, y, { align: "right" });
}

// ── Section header bar ────────────────────────────────────────────────────────

function sectionHeader(doc: jsPDF, title: string, y: number): number {
  setFill(doc, C.midBg);
  doc.rect(ML, y, CW, 8, "F");
  setFill(doc, C.gold);
  doc.rect(ML, y, 2.5, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  setColor(doc, C.gold);
  doc.text(title.toUpperCase(), ML + 6, y + 5.5);
  return y + 12;
}

// ── Two-column KPI grid ───────────────────────────────────────────────────────

type KpiEntry = { label: string; value: string; sub?: string; accent?: [number,number,number] };

function kpiGrid(doc: jsPDF, items: KpiEntry[], startY: number, cols = 4): number {
  const cellW = CW / cols;
  const cellH = 16;
  items.forEach((item, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = ML + col * cellW;
    const y = startY + row * (cellH + 3);
    // card bg
    setFill(doc, C.bodyBg);
    setDraw(doc, C.border);
    doc.roundedRect(x, y, cellW - 2, cellH, 1.5, 1.5, "FD");
    // accent top line
    setFill(doc, item.accent ?? C.gold);
    doc.rect(x, y, cellW - 2, 0.7, "F");
    // label
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    setColor(doc, C.dimText);
    doc.text(item.label.toUpperCase(), x + 3, y + 4.5);
    // value
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    setColor(doc, C.darkText);
    doc.text(item.value, x + 3, y + 10.5);
    // sub
    if (item.sub) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      setColor(doc, C.dimText);
      doc.text(item.sub, x + 3, y + 14);
    }
  });
  const rows = Math.ceil(items.length / cols);
  return startY + rows * (cellH + 3) + 4;
}

// ── Simple table ──────────────────────────────────────────────────────────────

type TableRow = string[];

function simpleTable(
  doc: jsPDF,
  headers: string[],
  rows: TableRow[],
  startY: number,
  colWidths?: number[],
): number {
  const widths = colWidths ?? headers.map(() => CW / headers.length);
  const rowH = 7;
  let y = startY;

  // header row
  setFill(doc, C.darkBg);
  doc.rect(ML, y, CW, rowH, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  setColor(doc, C.gold);
  let x = ML;
  headers.forEach((h, i) => {
    doc.text(h, x + 3, y + 5);
    x += widths[i];
  });
  y += rowH;

  // data rows
  rows.forEach((row, ri) => {
    setFill(doc, ri % 2 === 0 ? C.white : C.rowAlt);
    doc.rect(ML, y, CW, rowH, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    setColor(doc, C.darkText);
    let rx = ML;
    row.forEach((cell, ci) => {
      const align = ci > 0 ? "right" : "left";
      const tx = align === "right" ? rx + widths[ci] - 3 : rx + 3;
      doc.text(cell, tx, y + 5, { align });
      rx += widths[ci];
    });
    y += rowH;
  });

  // bottom border
  setDraw(doc, C.border);
  doc.line(ML, y, ML + CW, y);
  return y + 5;
}

// ── Horizontal bar (for segment/freebet charts) ───────────────────────────────

function hBar(doc: jsPDF, label: string, pct: number, value: string, y: number, color: [number,number,number]): number {
  const barW = (CW - 60) * (pct / 100);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  setColor(doc, C.dimText);
  doc.text(label, ML, y + 3.5);
  // track
  setFill(doc, C.border);
  doc.roundedRect(ML + 42, y, CW - 60, 5, 1, 1, "F");
  // fill
  if (barW > 0) {
    setFill(doc, color);
    doc.roundedRect(ML + 42, y, barW, 5, 1, 1, "F");
  }
  setColor(doc, C.darkText);
  doc.setFont("helvetica", "bold");
  doc.text(value, ML + CW, y + 3.8, { align: "right" });
  return y + 8;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function generateReport(data: ReportData): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const now = new Date();
  const generatedAt = now.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const ftdRate = data.registrations > 0
    ? ((data.ftds / data.registrations) * 100).toFixed(1)
    : "0.0";
  const lapsedCount = data.segments.find((s) => s.segment.toLowerCase().includes("laps"))?.count ?? 0;
  const vipCount = data.segments.find((s) => s.segment.toLowerCase().includes("vip"))?.count ?? 0;
  const totalSegmented = data.segments.reduce((s, r) => s + r.count, 0);

  // ── PAGE 1: COVER ──────────────────────────────────────────────────────────

  setFill(doc, C.darkBg);
  doc.rect(0, 0, PW, PH, "F");

  // decorative gold bar top
  setFill(doc, C.gold);
  doc.rect(0, 0, PW, 3, "F");

  // logo text
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  setColor(doc, C.white);
  doc.text("PLAYA BETS", PW / 2, 55, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  setColor(doc, C.gold);
  doc.text("ANALYTICS", PW / 2, 64, { align: "center" });

  // gold divider
  setFill(doc, C.gold);
  doc.rect(PW / 2 - 25, 70, 50, 0.5, "F");

  // report title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  setColor(doc, C.white);
  doc.text("Executive Performance Report", PW / 2, 85, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  setColor(doc, C.lightGray);
  doc.text("Platform Summary & Key Insights", PW / 2, 93, { align: "center" });

  // period box
  setFill(doc, C.midBg);
  doc.roundedRect(PW / 2 - 45, 105, 90, 28, 3, 3, "F");
  setFill(doc, C.gold);
  doc.rect(PW / 2 - 45, 105, 3, 28, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  setColor(doc, C.dimText);
  doc.text("REPORTING PERIOD", PW / 2 - 38, 113);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  setColor(doc, C.white);
  doc.text(`${data.dateFrom}  →  ${data.dateTo}`, PW / 2 - 38, 121);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  setColor(doc, C.dimText);
  doc.text(`Data as of: ${data.dataDate ?? "—"}`, PW / 2 - 38, 128);

  // snapshot boxes
  const snap = [
    { label: "Total Stake", value: fc(data.totalStake), color: C.gold },
    { label: "GGR (Sports)", value: fc(data.totalStake - data.totalWinnings), color: C.green },
    { label: "Registrations", value: fnum(data.registrations), color: C.gold },
    { label: "FTD Rate", value: `${ftdRate}%`, color: C.green },
  ];
  const snapY = 150;
  const snapW = (PW - 32) / 4;
  snap.forEach((s, i) => {
    const sx = 16 + i * snapW;
    setFill(doc, C.midBg);
    doc.roundedRect(sx, snapY, snapW - 4, 22, 2, 2, "F");
    setFill(doc, s.color);
    doc.rect(sx, snapY, snapW - 4, 1.2, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    setColor(doc, C.dimText);
    doc.text(s.label.toUpperCase(), sx + 4, snapY + 7);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    setColor(doc, C.white);
    doc.text(s.value, sx + 4, snapY + 16);
  });

  // confidentiality note
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  setColor(doc, C.dimText);
  doc.text("Confidential — For internal use only", PW / 2, 210, { align: "center" });

  // generated by
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  setColor(doc, [60, 90, 70] as [number,number,number]);
  doc.text(`Generated: ${generatedAt}  ·  Playa Bets Analytics Platform`, PW / 2, 280, { align: "center" });

  // gold bottom bar
  setFill(doc, C.gold);
  doc.rect(0, PH - 3, PW, 3, "F");

  // ── PAGE 2: EXECUTIVE SUMMARY + PERIOD KPIs ───────────────────────────────

  doc.addPage();
  // white page bg
  setFill(doc, C.white);
  doc.rect(0, 0, PW, PH, "F");

  // page header
  setFill(doc, C.darkBg);
  doc.rect(0, 0, PW, 16, "F");
  setFill(doc, C.gold);
  doc.rect(0, 0, 3, 16, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  setColor(doc, C.white);
  doc.text("Executive Summary", ML, 10.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  setColor(doc, C.dimText);
  doc.text(`${data.dateFrom} — ${data.dateTo}`, PW - MR, 10.5, { align: "right" });

  let y = 24;

  // ── Insight bullets ──────────────────────────────────────────────────────
  y = sectionHeader(doc, "AI Insights  (Template Mode)", y);

  const insights = [
    `Sportsbook generated total stake of ${fc(data.totalStake)} across ${fnum(data.totalBetslips)} betslips during the period, with a gross margin of ${fpct(data.grossMargin)}.`,
    `Player acquisition reached ${fnum(data.registrations)} new registrations, with ${fnum(data.ftds)} converting to first deposits — a conversion rate of ${ftdRate}%.`,
    `Casino GGR of ${fc(data.casinoGGR)} was recorded across ${data.casinoProviderCount} providers, representing a casino margin of ${fpct(data.casinoMargin)}.`,
    totalSegmented > 0
      ? `RFM segmentation covers ${fnum(totalSegmented)} active players. ${fnum(vipCount)} are classified as VIP and ${fnum(lapsedCount)} are at risk of lapsing — presenting a re-engagement opportunity.`
      : `Player activity segmentation is pending RFM model output for this period.`,
    data.totalDeposits > 0
      ? `Deposit volume reached ${fc(data.totalDeposits)} against withdrawals of ${fc(data.totalWithdrawals)}, generating a net inflow of ${fc(data.totalDeposits - data.totalWithdrawals)}.`
      : `Transaction data for this period is pending full pipeline integration.`,
  ];

  insights.forEach((text, i) => {
    const lines = doc.splitTextToSize(text, CW - 14) as string[];
    const blockH = lines.length * 4.5 + 7;

    setFill(doc, i % 2 === 0 ? C.bodyBg : C.white);
    doc.rect(ML, y, CW, blockH, "F");
    setFill(doc, C.gold);
    doc.rect(ML, y, 1.5, blockH, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    setColor(doc, C.gold);
    doc.text(`${i + 1}.`, ML + 4, y + 4.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    setColor(doc, C.darkText);
    doc.text(lines, ML + 10, y + 4.5, { lineHeightFactor: 1.5 });
    y += blockH + 2;
  });

  y += 6;

  // ── Period KPI table ───────────────────────────────────────────────────────
  y = sectionHeader(doc, "Period KPI Summary", y);

  const kpiItems: KpiEntry[] = [
    { label: "Total Betslips",     value: fnum(data.totalBetslips),          sub: "Selected range",           accent: C.gold  },
    { label: "Total Stake",        value: fc(data.totalStake),               sub: "Sportsbook",               accent: C.gold  },
    { label: "Sports GGR",         value: fc(data.totalStake - data.totalWinnings), sub: "Gross gaming revenue",     accent: C.green },
    { label: "Gross Margin",       value: fpct(data.grossMargin),            sub: "(Stake − Winnings) / Stake", accent: C.green },
    { label: "Registrations",      value: fnum(data.registrations),          sub: "New accounts",             accent: C.gold  },
    { label: "First Deposits",     value: fnum(data.ftds),                   sub: `${ftdRate}% conversion`,   accent: C.gold  },
    { label: "Sports Actives",     value: fnum(data.activePlayersSports),    sub: "Avg daily unique",         accent: C.green },
    { label: "Casino Actives",     value: fnum(data.activePlayersCasino),    sub: "Avg daily unique",         accent: C.green },
  ];

  y = kpiGrid(doc, kpiItems, y, 4);

  addFooter(doc, 2, 4, data.dataDate);

  // ── PAGE 3: CASINO + PLAYERS ──────────────────────────────────────────────

  doc.addPage();
  setFill(doc, C.white);
  doc.rect(0, 0, PW, PH, "F");

  // page header
  setFill(doc, C.darkBg);
  doc.rect(0, 0, PW, 16, "F");
  setFill(doc, C.gold);
  doc.rect(0, 0, 3, 16, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  setColor(doc, C.white);
  doc.text("Casino & Player Analytics", ML, 10.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  setColor(doc, C.dimText);
  doc.text(`${data.dateFrom} — ${data.dateTo}`, PW - MR, 10.5, { align: "right" });

  y = 24;

  // ── Casino KPIs ────────────────────────────────────────────────────────────
  y = sectionHeader(doc, "Casino Performance", y);

  const casinoItems: KpiEntry[] = [
    { label: "Casino Stake",    value: fc(data.casinoStake),      sub: "All providers",         accent: C.gold  },
    { label: "Casino GGR",      value: fc(data.casinoGGR),        sub: "Gross gaming revenue",  accent: C.green },
    { label: "Providers",       value: `${data.casinoProviderCount}`, sub: "Active providers",  accent: C.gold  },
    { label: "Casino Margin",   value: fpct(data.casinoMargin),   sub: "House edge",            accent: C.green },
  ];

  y = kpiGrid(doc, casinoItems, y, 4);

  // ── Bonus ──────────────────────────────────────────────────────────────────
  y = sectionHeader(doc, "Bonus & Campaigns", y);

  const bonusItems: KpiEntry[] = [
    { label: "Bonuses Credited", value: fc(data.bonusesCredited),      sub: "Selected range",     accent: C.amber },
    { label: "Freebet Usage",    value: fpct(data.freebetUsagePct, 1), sub: "Used / Issued",       accent: C.amber },
    { label: "Total Deposits",   value: data.totalDeposits > 0 ? fc(data.totalDeposits) : "Pending",   sub: "Transaction inflow",  accent: C.green },
    { label: "Net Cash Flow",    value: data.totalDeposits > 0 ? fc(data.totalDeposits - data.totalWithdrawals) : "Pending", sub: "Deposits − Withdrawals", accent: C.green },
  ];

  y = kpiGrid(doc, bonusItems, y, 4);

  // ── RFM Segment Distribution ───────────────────────────────────────────────
  y = sectionHeader(doc, "Player Segment Distribution (RFM)", y);

  if (data.segments.length > 0) {
    const segColors: Record<string, [number,number,number]> = {
      vip:      C.gold,
      active:   C.green,
      new:      [100, 180, 220] as [number,number,number],
      cooling:  C.amber,
      lapsed:   C.red,
      dormant:  [140, 120, 100] as [number,number,number],
    };
    data.segments.forEach((seg) => {
      const key = seg.segment.toLowerCase();
      const color = Object.entries(segColors).find(([k]) => key.includes(k))?.[1] ?? C.dimText;
      y = hBar(doc, seg.segment, seg.pct, `${fnum(seg.count)}  (${seg.pct.toFixed(1)}%)`, y, color);
    });
    y += 4;
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    setColor(doc, C.dimText);
    doc.text("RFM segment data pending for this period.", ML, y + 4);
    y += 14;
  }

  // ── Transactions table ─────────────────────────────────────────────────────
  y = sectionHeader(doc, "Transaction Summary", y);

  const txRows: TableRow[] = [
    ["Total Deposits",    data.totalDeposits > 0 ? fc(data.totalDeposits) : "Pending", "All deposit transactions"],
    ["Total Withdrawals", data.totalWithdrawals > 0 ? fc(data.totalWithdrawals) : "Pending", "All withdrawal transactions"],
    ["Net Cash Flow",     data.totalDeposits > 0 ? fc(data.totalDeposits - data.totalWithdrawals) : "Pending", "Deposits minus withdrawals"],
  ];

  y = simpleTable(
    doc,
    ["Metric", "Value", "Notes"],
    txRows,
    y,
    [60, 55, 55],
  );

  addFooter(doc, 3, 4, data.dataDate);

  // ── PAGE 4: SPORTSBOOK DETAIL + NOTES ────────────────────────────────────

  doc.addPage();
  setFill(doc, C.white);
  doc.rect(0, 0, PW, PH, "F");

  // page header
  setFill(doc, C.darkBg);
  doc.rect(0, 0, PW, 16, "F");
  setFill(doc, C.gold);
  doc.rect(0, 0, 3, 16, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  setColor(doc, C.white);
  doc.text("Sportsbook Detail", ML, 10.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  setColor(doc, C.dimText);
  doc.text(`${data.dateFrom} — ${data.dateTo}`, PW - MR, 10.5, { align: "right" });

  y = 24;

  y = sectionHeader(doc, "Sportsbook KPI Breakdown", y);

  const sbRows: TableRow[] = [
    ["Total Betslips",   fnum(data.totalBetslips),               "Unique betslip count"],
    ["Total Stake",      fc(data.totalStake),                    "Total amount wagered"],
    ["Total Winnings",   fc(data.totalWinnings),                 "Paid to players"],
    ["Gross Revenue",    fc(data.totalStake - data.totalWinnings), "Stake minus winnings"],
    ["Gross Margin",     fpct(data.grossMargin),                 "(Stake − Winnings) / Stake"],
    ["Sports Actives",   fnum(data.activePlayersSports),         "Avg daily unique bettors"],
    ["Avg Stake/Slip",   data.totalBetslips > 0 ? fc(data.totalStake / data.totalBetslips) : "—", "Mean stake per betslip"],
  ];

  y = simpleTable(
    doc,
    ["Metric", "Value", "Description"],
    sbRows,
    y,
    [65, 50, 55],
  );

  y += 4;

  y = sectionHeader(doc, "Registration & Conversion Funnel", y);

  const regRows: TableRow[] = [
    ["New Registrations", fnum(data.registrations),   "Total accounts created"],
    ["First Deposits",    fnum(data.ftds),             "Unique depositing players"],
    ["FTD Conversion",    `${ftdRate}%`,               "FTDs / Registrations"],
  ];

  y = simpleTable(
    doc,
    ["Stage", "Count", "Notes"],
    regRows,
    y,
    [65, 45, 60],
  );

  y += 8;

  // ── Data notes ─────────────────────────────────────────────────────────────
  y = sectionHeader(doc, "Data Notes & Methodology", y);

  const notes = [
    "• Sportsbook KPIs are sourced from the daily_kpis.parquet serving layer, aggregated from raw betslip records.",
    "• Casino metrics are aggregated from casino_daily.parquet and casino_providers_daily.parquet.",
    "• RFM segments are computed at month-end using recency (last bet/login/session), frequency (bet count), and monetary (stake value) scoring.",
    "• Player counts reflect unique UserIDs active within the reporting period.",
    "• Betslip counts in the By Status / By Type charts may undercount relative to total betslips due to the rolling raw extract window.",
    "• This report was generated using template-based insights. AI-generated narrative will replace this section in a future release.",
    "• All monetary values are in South African Rand (ZAR / R).",
    "• Data is refreshed on a 2-hourly schedule. Last refresh is shown in the report timestamp.",
  ];

  notes.forEach((note) => {
    const lines = doc.splitTextToSize(note, CW - 6) as string[];
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    setColor(doc, C.darkText);
    doc.text(lines, ML + 3, y, { lineHeightFactor: 1.5 });
    y += lines.length * 4.5 + 2;
  });

  addFooter(doc, 4, 4, data.dataDate);

  // ── Download ───────────────────────────────────────────────────────────────
  const filename = `playabets_report_${data.dateFrom}_${data.dateTo}.pdf`;
  doc.save(filename);
}
