/**
 * PLAYA BETS - PDF Report Generator (v2)
 * Clean 2-page A4 report with real AI insights from Azure OpenAI.
 */

import jsPDF from "jspdf";

export interface AiInsights {
  wins: string[];
  alerts?: string[];
  concerns?: string[]; // legacy - mapped to alerts
  watch_list: string[];
  recommendations?: string[]; // removed from prompt, kept for backward compat
}

export interface ReportData {
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
  avgFtdValue?: number;
  activePlayersSports: number;
  activePlayersCasino: number;
  // Segments (kept for type compat, no longer shown in report)
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
  ggr?: number;
  holdPct?: number;
  churnPct?: number;
  retentionD7?: number;
  retentionD30?: number;
  totalVips?: number;
  vipGgr?: number;
  // AI insights (pre-fetched)
  aiInsights?: AiInsights | null;
}

const C = {
  darkBg:   [10, 32, 20]    as [number,number,number],
  midBg:    [18, 45, 28]    as [number,number,number],
  gold:     [201, 168, 76]  as [number,number,number],
  green:    [76, 175, 127]  as [number,number,number],
  white:    [255, 255, 255] as [number,number,number],
  lightGray:[200, 210, 205] as [number,number,number],
  dimText:  [140, 160, 148] as [number,number,number],
  bodyBg:   [248, 250, 249] as [number,number,number],
  rowAlt:   [240, 245, 242] as [number,number,number],
  border:   [220, 230, 225] as [number,number,number],
  darkText: [25, 40, 30]    as [number,number,number],
  amber:    [210, 150, 60]  as [number,number,number],
  red:      [200, 70, 70]   as [number,number,number],
};

const PW = 210, PH = 297, ML = 14, MR = 14, CW = PW - ML - MR;

// Full numbers with thousands separator - no abbreviation
function fc(n: number): string {
  const s = n < 0 ? "-" : "", a = Math.abs(n);
  return `${s}R ${a.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`;
}
function fnum(n: number): string {
  const s = n < 0 ? "-" : "", a = Math.abs(n);
  return `${s}${a.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`;
}
function fpct(n: number): string { return `${n.toFixed(1)}%`; }
function sf(doc: jsPDF, rgb: [number,number,number]) { doc.setFillColor(rgb[0],rgb[1],rgb[2]); }
function sc(doc: jsPDF, rgb: [number,number,number]) { doc.setTextColor(rgb[0],rgb[1],rgb[2]); }
function sd(doc: jsPDF, rgb: [number,number,number]) { doc.setDrawColor(rgb[0],rgb[1],rgb[2]); }

function pageHeader(doc: jsPDF, title: string, sub: string) {
  sf(doc, C.darkBg); doc.rect(0,0,PW,14,"F");
  sf(doc, C.gold);   doc.rect(0,0,3,14,"F");
  doc.setFont("helvetica","bold"); doc.setFontSize(10); sc(doc,C.white);
  doc.text(title, ML+4, 9.5);
  doc.setFont("helvetica","normal"); doc.setFontSize(7.5); sc(doc,C.dimText);
  doc.text(sub, PW-MR, 9.5, {align:"right"});
}

function footer(doc: jsPDF, page: number, total: number, dataDate: string|null) {
  sf(doc,C.darkBg); doc.rect(0,PH-11,PW,11,"F");
  doc.setFont("helvetica","normal"); doc.setFontSize(7); sc(doc,C.dimText);
  doc.text("Playa Bets Analytics  |  Confidential", ML, PH-4.5);
  doc.text(`Data as of: ${dataDate??"-"}`, PW/2, PH-4.5, {align:"center"});
  doc.text(`Page ${page} of ${total}`, PW-MR, PH-4.5, {align:"right"});
}

function secHeader(doc: jsPDF, title: string, y: number): number {
  sf(doc,C.midBg); doc.rect(ML,y,CW,7,"F");
  sf(doc,C.gold);  doc.rect(ML,y,2,7,"F");
  doc.setFont("helvetica","bold"); doc.setFontSize(8); sc(doc,C.gold);
  doc.text(title.toUpperCase(), ML+5, y+5);
  return y+10;
}

type KpiEntry = {label:string; value:string; sub?:string; accent?:[number,number,number]};

function kpiRow(doc: jsPDF, items: KpiEntry[], y: number): number {
  const cols = items.length <= 4 ? items.length : 4;
  const w = CW / cols;
  const h = 14;
  items.forEach((it, i) => {
    const x = ML + (i % cols) * w;
    const ry = y + Math.floor(i / cols) * (h + 2);
    sf(doc, C.bodyBg); sd(doc, C.border);
    doc.roundedRect(x, ry, w-2, h, 1, 1, "FD");
    sf(doc, it.accent ?? C.gold);
    doc.rect(x, ry, w-2, 0.6, "F");
    doc.setFont("helvetica","normal"); doc.setFontSize(5.5); sc(doc, C.dimText);
    doc.text(it.label.toUpperCase(), x+2.5, ry+4);
    doc.setFont("helvetica","bold"); doc.setFontSize(7.5); sc(doc, C.darkText);
    doc.text(it.value, x+2.5, ry+10.5);
    if (it.sub) {
      doc.setFont("helvetica","normal"); doc.setFontSize(5.5); sc(doc, C.dimText);
      doc.text(it.sub, x+2.5, ry+13.5);
    }
  });
  const rows = Math.ceil(items.length / cols);
  return y + rows * (h + 2) + 3;
}

function insightBlock(
  doc: jsPDF,
  label: string,
  items: string[],
  y: number,
  color: [number,number,number],
  bgColor: [number,number,number],
): number {
  if (!items || items.length === 0) return y;
  // Label pill
  sf(doc, color);
  doc.roundedRect(ML, y, 28, 5.5, 1, 1, "F");
  doc.setFont("helvetica","bold"); doc.setFontSize(6); sc(doc, C.white);
  doc.text(label.toUpperCase(), ML+14, y+3.8, {align:"center"});
  y += 7;

  items.forEach((item) => {
    const lines = doc.splitTextToSize(`- ${item}`, CW - 6) as string[];
    const bh = lines.length * 4 + 4;
    sf(doc, bgColor);
    doc.rect(ML, y, CW, bh, "F");
    sf(doc, color);
    doc.rect(ML, y, 1.2, bh, "F");
    doc.setFont("helvetica","normal"); doc.setFontSize(7.5); sc(doc, C.darkText);
    doc.text(lines, ML+4, y+3.5, {lineHeightFactor:1.4});
    y += bh + 1.5;
  });
  return y + 3;
}

export function generateReport(data: ReportData): void {
  const doc = new jsPDF({orientation:"portrait", unit:"mm", format:"a4"});
  const now = new Date();
  const generatedAt = now.toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
  const ftdRate = data.registrations > 0 ? ((data.ftds/data.registrations)*100).toFixed(1) : "0.0";
  const ggr = data.ggr ?? (data.totalStake - data.totalWinnings);
  const netCash = data.totalDeposits - data.totalWithdrawals;

  // -- PAGE 1: COVER ------------------------------------------------------------
  sf(doc, C.darkBg); doc.rect(0,0,PW,PH,"F");
  sf(doc, C.gold);   doc.rect(0,0,PW,2.5,"F");
  sf(doc, C.gold);   doc.rect(0,PH-2.5,PW,2.5,"F");

  doc.setFont("helvetica","bold"); doc.setFontSize(26); sc(doc, C.white);
  doc.text("PLAYA BETS", PW/2, 52, {align:"center"});
  doc.setFont("helvetica","normal"); doc.setFontSize(10); sc(doc, C.gold);
  doc.text("ANALYTICS PLATFORM", PW/2, 60, {align:"center"});

  sf(doc, C.gold); doc.rect(PW/2-20,65,40,0.4,"F");

  doc.setFont("helvetica","bold"); doc.setFontSize(16); sc(doc, C.white);
  doc.text("Executive Performance Report", PW/2, 78, {align:"center"});
  doc.setFont("helvetica","normal"); doc.setFontSize(9); sc(doc, C.lightGray);
  doc.text("Platform Summary & Key Insights", PW/2, 85, {align:"center"});

  // Period box
  sf(doc, C.midBg); doc.roundedRect(PW/2-42,95,84,22,2,2,"F");
  sf(doc, C.gold);  doc.rect(PW/2-42,95,2.5,22,"F");
  doc.setFont("helvetica","normal"); doc.setFontSize(7); sc(doc, C.dimText);
  doc.text("REPORTING PERIOD", PW/2-36, 102);
  doc.setFont("helvetica","bold"); doc.setFontSize(11); sc(doc, C.white);
  doc.text(`${data.dateFrom}  to  ${data.dateTo}`, PW/2-36, 110);
  doc.setFont("helvetica","normal"); doc.setFontSize(7); sc(doc, C.dimText);
  doc.text(`Data as of: ${data.dataDate??"-"}`, PW/2-36, 115);

  // 4 snapshot KPIs
  const snaps = [
    {label:"Registrations", value:fnum(data.registrations), color:C.gold},
    {label:"FTDs",           value:fnum(data.ftds),          color:C.green},
    {label:"GGR",            value:fc(ggr),                  color:C.gold},
    {label:"Net Cash",       value:fc(netCash),              color:C.green},
  ];
  const sw = (CW)/4;
  snaps.forEach((s,i) => {
    const sx = ML + i*sw;
    sf(doc,C.midBg); doc.roundedRect(sx,128,sw-3,18,1.5,1.5,"F");
    sf(doc,s.color); doc.rect(sx,128,sw-3,1,"F");
    doc.setFont("helvetica","normal"); doc.setFontSize(6); sc(doc,C.dimText);
    doc.text(s.label.toUpperCase(), sx+3, 134);
    doc.setFont("helvetica","bold"); doc.setFontSize(10); sc(doc,C.white);
    doc.text(s.value, sx+3, 142);
  });

  doc.setFont("helvetica","italic"); doc.setFontSize(7); sc(doc,C.dimText);
  doc.text("Confidential - For internal use only", PW/2, 196, {align:"center"});
  doc.setFont("helvetica","normal"); doc.setFontSize(6.5); sc(doc,[60,90,70] as [number,number,number]);
  doc.text(`Generated: ${generatedAt}  |  Playa Bets Analytics Platform`, PW/2, 275, {align:"center"});

  // -- PAGE 2: KPIs + AI INSIGHTS -----------------------------------------------
  doc.addPage();
  sf(doc,C.white); doc.rect(0,0,PW,PH,"F");
  pageHeader(doc, "Performance Summary", `${data.dateFrom} - ${data.dateTo}`);
  let y = 18;

  // KPI grid
  y = secHeader(doc, "Key Performance Indicators", y);
  const kpis: KpiEntry[] = [
    {label:"Registrations",   value:fnum(data.registrations),        sub:`${ftdRate}% conv rate`,    accent:C.gold},
    {label:"FTDs",            value:fnum(data.ftds),                 sub:`R${data.avgFtdValue?.toFixed(0)??"-"} avg`,  accent:C.gold},
    {label:"Active Players",  value:fnum(data.activePlayersSports+data.activePlayersCasino), sub:"Sports + Casino", accent:C.green},
    {label:"GGR",             value:fc(ggr),                         sub:data.holdPct ? `${data.holdPct.toFixed(1)}% hold` : "Gross Gaming Revenue", accent:C.green},
    {label:"NGR",             value:data.ngr ? fc(data.ngr) : "-",  sub:"Net Gaming Revenue",        accent:C.green},
    {label:"Total Deposits",  value:data.totalDeposits>0?fc(data.totalDeposits):"Pending", sub:"Period deposits", accent:C.gold},
    {label:"Net Cash",        value:data.totalDeposits>0?fc(netCash):"Pending",            sub:"Deposits - Withdrawals", accent:C.gold},
    {label:"VIP GGR",         value:data.vipGgr?fc(data.vipGgr):"-", sub:`${data.totalVips??0} VIP players`, accent:C.amber},
  ];
  y = kpiRow(doc, kpis, y);

  // Secondary metrics row
  const sec2: KpiEntry[] = [
    {label:"Churn Rate",      value:data.churnPct?fpct(data.churnPct):"-",     sub:"Monthly churn",    accent:C.red},
    {label:"D7 Retention",    value:data.retentionD7?fpct(data.retentionD7):"-", sub:"Return within 7d", accent:C.green},
    {label:"D30 Retention",   value:data.retentionD30?fpct(data.retentionD30):"-",sub:"Return within 30d",accent:C.green},
    {label:"Bonus Issued",    value:data.bonusesCredited>0?fc(data.bonusesCredited):"-", sub:"Total bonuses",  accent:C.amber},
  ];
  y = kpiRow(doc, sec2, y);

  // AI Insights
  y = secHeader(doc, "AI Insights - Azure OpenAI (gpt-4o-mini)", y);

  if (data.aiInsights) {
    const ai = data.aiInsights;
    y = insightBlock(doc, "Wins",       ai.wins,                          y, [76,175,127],  [240,250,245] as [number,number,number]);
    y = insightBlock(doc, "Alerts",     ai.alerts ?? ai.concerns ?? [],   y, [200,70,70],   [252,242,242] as [number,number,number]);
    y = insightBlock(doc, "Watch List", ai.watch_list,                    y, [210,150,60],  [252,248,238] as [number,number,number]);
  } else {
    doc.setFont("helvetica","italic"); doc.setFontSize(8); sc(doc, C.dimText);
    doc.text("AI insights not available for this period - ensure Azure OpenAI is configured.", ML+3, y+4);
    y += 12;
  }

  // Notes
  if (y < PH - 40) {
    y = secHeader(doc, "Notes", y);
    const notes = [
      "All monetary values are in South African Rand (ZAR). Data is refreshed every 2 hours.",
      "GGR = Total Stakes minus Total Payouts. NGR = GGR minus Bonuses. Hold % = GGR / Turnover x 100.",
      "FTD Conversion = First Time Depositors / Registrations. Avg FTD Value = Total first deposit value / FTDs.",
      "Retention rates are calculated from raw betslip cohorts. D7/D30 = % of new players who returned within 7/30 days.",
    ];
    notes.forEach(note => {
      const lines = doc.splitTextToSize(`- ${note}`, CW-4) as string[];
      doc.setFont("helvetica","normal"); doc.setFontSize(7); sc(doc, C.darkText);
      doc.text(lines, ML+2, y, {lineHeightFactor:1.4});
      y += lines.length*3.8+1.5;
    });
  }

  footer(doc, 2, 2, data.dataDate);

  const filename = `playabets_report_${data.dateFrom}_${data.dateTo}.pdf`;
  doc.save(filename);
}
