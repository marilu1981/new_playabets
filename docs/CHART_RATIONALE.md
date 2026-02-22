# Playa Bets Dashboard — Chart & Page Rationale

> **Purpose of this document:** Explains the business reasoning behind every page and every chart in the dashboard. Written for non-technical stakeholders who need to understand *why* each visual exists, not just what it shows.

---

## Design Principle

Every chart answers one of three questions:

| Question | Type of chart |
|---|---|
| **How much?** (scale, volume) | KPI card, bar chart |
| **How is it changing?** (trend, direction) | Line chart, area chart |
| **What is the mix?** (composition, proportion) | Pie/donut chart, stacked bar |

If a chart cannot be linked to a business decision, it should not be on the dashboard.

---

## Page 1 — Executive Overview (Dashboard)

**Who uses it:** C-suite, Head of Analytics, Country Managers.
**Core question it answers:** "Is the business growing, and where is the money coming from?"

---

### KPI Cards (12 cards across 3 rows)

| Card | Why it's here |
|---|---|
| **Registrations** | Top-of-funnel health. If this drops, everything downstream will drop in 30–60 days. |
| **FTDs** (First-Time Depositors) | The moment a player becomes a revenue-generating customer. The most important acquisition metric. |
| **V_FTDs** (Verified FTDs) | FTDs who passed identity verification. Relevant for regulated markets (KYC compliance). |
| **Top_FTDs** | High-value first depositors (above a threshold). Indicates quality of acquisition, not just quantity. |
| **Actives** | Unique players who placed a bet in the period. The true "engaged user base." |
| **Total Deposits** | Gross cash in. Measures player intent and trust in the platform. |
| **Total Withdrawals** | Cash out. A healthy ratio of deposits-to-withdrawals signals player retention. |
| **Total Turnover** | Sum of all stakes placed. Measures betting activity volume regardless of outcome. |
| **GGR** (Gross Gaming Revenue) | Turnover minus winnings paid. The primary revenue line before costs. |
| **NGR** (Net Gaming Revenue) | GGR minus bonuses paid. The closest proxy to actual profit from operations. |
| **Bonus Spent** | Total bonus value redeemed. High bonus spend relative to NGR is a margin risk signal. |
| **Conversion Rate** | Registrations → FTD rate. If 100 people register and 38 deposit, conversion is 38%. Measures how well the onboarding funnel works. |

**Why show % change vs last month on every card?** Because absolute numbers without context are misleading. ₦1.4M GGR means nothing unless you know it was ₦1.3M last month (+7.7%) or ₦2.1M last month (−33%).

---

### Revenue Trends (GGR / NGR / Turnover toggle)

**Chart type:** Multi-line chart with toggle.
**Answers:** "Is revenue trending up or down, and is the margin holding?"
**Why three lines on one toggle?** GGR shows gross performance, NGR shows net performance after bonus costs, and Turnover shows betting activity. If Turnover is rising but GGR is flat, it means margins are compressing — a risk signal. The toggle avoids clutter while keeping all three accessible.

---

### Player Acquisition (Trend / MoM toggle)

**Chart type:** Bar chart (Registrations vs FTDs side-by-side).
**Answers:** "Are we acquiring players and converting them?"
**Why two bars?** Registrations without FTDs is vanity. The gap between the two bars is the unconverted funnel — a direct target for CRM and onboarding improvement.
**MoM toggle:** Month-on-month % change view lets you see acceleration or deceleration in growth, which is more useful than raw numbers for trend analysis.

---

### Conversion Rate (Line chart)

**Chart type:** Daily line chart.
**Answers:** "Is our registration-to-deposit funnel improving or degrading over time?"
**Why separate from the KPI card?** The KPI card shows the period average. This chart shows the daily shape — you can see if conversion dropped after a specific campaign ended, or spiked after a bonus offer launched.

---

### Segment Distribution (Donut pie)

**Chart type:** Donut with legend.
**Answers:** "What proportion of our active players are VIP, PVIP, Mass, or Mix?"
**Why it matters:** VIP players (small in number) typically generate 60–80% of GGR. If the VIP slice shrinks, revenue is at risk even if total actives grow. This is a player quality signal, not a volume signal.

---

### Deposit vs Withdrawal Flow (Bar chart)

**Chart type:** Grouped bar chart by month.
**Answers:** "Is cash flowing in faster than it's flowing out?"
**Why it matters:** A healthy sportsbook has deposits consistently above withdrawals. If withdrawals approach or exceed deposits, it signals player churn, a winning streak event, or a liquidity risk. This is a cash flow health check.

---

### Segment Performance (KPI row)

**Chart type:** 4 summary tiles.
**Answers:** "How many players are in each segment right now?"
**Why it's separate from the pie chart?** The pie shows proportion. This row shows absolute counts. Both are needed — a segment can be 40% of the pie but only 2,000 players, which is very different from 40% and 80,000 players.

---

### Summary Metrics Table (4 tabs + Export)

**Chart type:** Tabular data with period comparison.
**Answers:** "Give me all the numbers in one place so I can report to the board."
**Why 4 tabs?** Overview (top-line KPIs), Sport Details (sportsbook-specific), Casino Details (casino-specific), All Metrics (everything). Analysts need to slice by product line for P&L reporting.
**Why Export to Excel?** Most betting operators still report to stakeholders via Excel. The export makes the dashboard the single source of truth rather than a parallel data pull.

---

### Geographic Distribution (Dual-axis bar chart)

**Chart type:** Bar chart with two Y-axes — Players (left axis) and GGR (right axis).
**Answers:** "Which countries have the most players, and which generate the most revenue — and are they the same countries?"

**Why two metrics on one chart?**
This is the key insight: a country with many players but low GGR is an acquisition problem (players are registering but not depositing enough, or margins are thin). A country with few players but high GGR is a high-value market worth investing in further. If you only showed players, you'd miss the revenue concentration. If you only showed GGR, you'd miss the scale opportunity.

**Example:** Nigeria might have 68,000 players and ₦842K GGR. Kenya might have 22,000 players and ₦281K GGR. GGR per player is similar — both markets are equally efficient. But if Ghana had 24,000 players and only ₦50K GGR, that signals a problem specific to Ghana (low deposit rates, wrong product mix, currency issues) that wouldn't be visible from a single-metric chart.

**Decision it drives:** Where to allocate marketing budget, where to investigate operational issues, and which markets to prioritise for product localisation.

---

### Traffic Source Breakdown (Donut pie)

**Chart type:** Donut with legend.
**Answers:** "How are players finding us?"
**Why it matters:** Organic traffic is free and sustainable. Paid traffic has a cost-per-acquisition. Affiliate traffic has a commission cost. If 80% of registrations come from paid channels, the business is expensive to grow. If organic is growing, the brand is strengthening. This chart directly informs the marketing budget allocation decision.

---

### Trend by Segment (Stacked bar chart)

**Chart type:** Stacked bar by month, segmented by VIP/PVIP/Mass/Mix.
**Answers:** "Is the revenue mix shifting between segments over time?"
**Why stacked?** You see total GGR height AND the composition in one view. If total GGR is flat but the VIP slice is shrinking and Mass is growing, that's a margin risk — Mass players generate lower GGR per player. This is a segment health trend, not just a snapshot.

---

### Daily Trend with 7-day Moving Average (Line chart)

**Chart type:** Two lines — raw daily GGR and 7-day rolling average.
**Answers:** "Is today's performance normal, or is something unusual happening?"
**Why the 7-day MA?** Daily GGR is noisy — it spikes on weekends (football), drops on quiet Tuesdays. The 7-day moving average smooths the noise and shows the underlying trend direction. If the MA is declining while daily values are volatile, the business is in a downtrend even if individual days look okay. This is the most operationally useful chart for a daily analyst.

---

### Stake vs Revenue (Area chart)

**Chart type:** Area chart, last 30 days.
**Answers:** "How much of the stake are we keeping as revenue?"
**Why area (not line)?** The filled area makes the gap between Stake and Revenue visually obvious — that gap is the winnings paid out. A narrowing gap means margins are improving. A widening gap means the house is paying out more than usual (could be a big win event, or a product pricing issue).

---

### Betslip Status (Pie chart)

**Chart type:** Donut pie.
**Answers:** "What is the current state of all bets on the platform?"
**Why it matters:** "In Progress" bets represent unsettled liability. "To Be Paid" bets are a cash obligation. "Cancelled" bets indicate operational issues or voided events. This is a real-time operational health check for the trading/risk team.

---

### Top Sports by Revenue (Horizontal bar chart)

**Chart type:** Horizontal bar, ranked by GGR.
**Answers:** "Which sports are generating the most revenue?"
**Why horizontal?** Sport names are long — horizontal bars give space for labels without rotation. Ranked order makes the top performer immediately obvious.
**Decision it drives:** Which sports to prioritise for odds compilation, marketing, and event coverage.

---

### By Platform (Progress bars)

**Chart type:** Horizontal progress bars (Mobile / Web / USSD).
**Answers:** "How are players accessing the platform?"
**Why it matters:** If 80% of bets are placed on mobile, the mobile experience is the product. Any mobile performance issue directly impacts 80% of revenue. This informs technology investment priorities.

---

### User Status (List)

**Chart type:** Status list with counts.
**Answers:** "How many players are active, inactive, dormant, or blocked?"
**Why it matters:** Dormant players are a re-engagement opportunity. Blocked players indicate compliance actions. A growing "inactive" count signals a retention problem. This is a CRM health signal.

---

### Detailed Breakdown Table (with Export)

**Chart type:** Tabular data — Date, Brand, Segment, Territory, Value, % Change.
**Answers:** "Show me the raw numbers behind the charts, sliced by the dimensions I care about."
**Why it replaces Upcoming Events?** Upcoming Events is an operational tool for the trading desk — it belongs on the Betting page. The Detailed Breakdown is an analytical tool for the business analyst who needs to drill into the numbers after seeing a trend in the charts above.
**Export button:** Same rationale as Summary Metrics — enables reporting workflows without requiring a separate data pull.

---

## Pages 2–9 (Summary)

| Page | Core question | Primary audience |
|---|---|---|
| **Users & Players** | Who are our players and how are they behaving? | CRM, Retention |
| **Betting & Events** | Which events and bet types drive the most revenue? | Trading, Sportsbook |
| **Transactions** | Is money moving in and out as expected? | Finance, Risk |
| **Bonus & Campaigns** | Are our promotions profitable? | Marketing |
| **Casino & Games** | Which games and providers generate the most GGR? | Casino Product |
| **Commissions** | How much are we paying agents and affiliates? | Finance, Partnerships |
| **Compliance & Audit** | Are we meeting regulatory obligations? | Legal, Compliance |
| **Hierarchy & Roles** | Who has access to what in the system? | IT, Operations |

---

## A Note on Mock Data

All numbers currently displayed are **fictional mock data** that mirrors the structure of the `isbets_bi` DWH views. No real player or financial data is present. When the VPN connection is established and the API layer is activated, all charts will pull from the live DWH views documented in `DWH - Technical Documentation.docx`.

---

*Document maintained alongside `build.md`. Last updated: February 2026.*
