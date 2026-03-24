# Dashboard Backlog

## Next Pages

### Daily KPI Monitor
- Current-day operational monitor only
- Focus on alerts, flags, and key same-day movements
- Candidate widgets:
  - registrations today
  - FTDs today
  - sportsbook turnover and GGR today
  - casino turnover and GGR today
  - open exposure
  - pending withdrawals
  - AML alerts
  - flagged transactions
  - self-exclusions started today
  - unusual spikes or drops vs recent average

### Campaign Performance
- Dedicated campaign analysis page or section
- Keep the filter scope intentionally narrow:
  - `campaignid`
  - `bonustype`
  - `campaignstatus`
- Use campaign-level aggregate extracts keyed by `CampaignID`
- Defer `incremental_bonus_campaign_performance.py` until after the current core extracts are brought fully up to date
- Defer `incremental_bonus_users_campaigns.py` unless campaign audience detail is needed beyond the aggregate performance snapshot

## Deferred Extracts
- Retry `incremental_selfexclusions.py` later after the current core refresh is stable

## Next Starting Point
- Next session starts with loading the refreshed serving outputs into Supabase before any further dashboard wiring
