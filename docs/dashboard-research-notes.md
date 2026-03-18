# Playa Bets Dashboard - Research Notes

## Brand Identity
- Company: Playa Bets ("All bets are on!")
- Logo: Lion head icon + "PLAYA Bets" text
- Partner: Z1G Data Platform / Alternata
- Colors: Black, white, gold/amber (from logo)

## Tech Stack (from project instructions)
- Frontend: React + TypeScript + TailwindCSS (Vite scaffold)
- The project says to follow the "tech stack file" - this appears to be the web-static scaffold

## Dashboard Pages Required (based on Use Cases & DWH Views)

### 1. Overview / Executive Dashboard
- KPI cards: Total Users, Active Users, Total Bets, Revenue
- Charts: Daily bets volume, Revenue trend, User registrations

### 2. Users & Players
- User list with status (Enabled, Disabled, Frozen, etc.)
- User hierarchy/structure
- Sessions overview
- Self-exclusions / Responsible Gaming

### 3. Betting & Events
- Betslips overview (Open, Paid, Cancelled)
- Bet types breakdown (Single, Multiple, Combined)
- Sports performance (by sport type)
- Live vs Pre-match breakdown
- Application type breakdown (Web, Mobile, API)

### 4. Financial & Transactions
- Deposits/Withdrawals summary
- Balance overview
- Currency breakdown
- Transaction management status

### 5. Bonus & Campaigns
- Active campaigns
- Bonus redemption rates
- Freebet usage
- Campaign ROI

### 6. Casino / Games
- Provider performance
- Casino vs Virtual Games
- Stake/Winnings/Profit by provider

### 7. Commissions
- Sport Direct/Network commissions
- Casino Direct/Network commissions
- Agent commission summary

### 8. Compliance & Audit
- Self-exclusion monitoring
- User status changes
- Session audit logs

## DWH Views Summary

### Lookup Views
- view_Reasons - reason codes
- view_ReasonsProviders - provider reasons
- view_CurrencyExchanges - exchange rates
- view_Providers - provider info

### Users Views
- view_Users - main user data (UserID, Username, Status, Type, Currency, Country, etc.)
- view_UserParameters - user parameters
- view_UserAdditionalData - additional user data
- view_UserNotes - user notes
- view_Balances - user balances (Balance, Credit)
- view_CurrentHierarchy - user hierarchy
- view_CurrentUsersStructure - user structure with MasterID
- view_GroupsUsers - agent groups
- view_UserGroups - group data
- view_UserGroupsAreas - BetAdmin areas
- view_UserSessions - session data (LoginDate, LogoutDate, IP, ApplicationType)
- view_UsersSelfexclusions - self-exclusion data
- view_UsersSelfexclusionsHistorical - historical self-exclusions

### Transactions
- view_Transactions - all transactions (Amount, Date, Balance, Reason, Currency)

### Bonus Views
- view_BonusCampaigns - campaign definitions
- view_BonusUsersCampaigns - users per campaign
- view_BonusTransactions - bonus transactions
- view_BonusBonuses - bonus entries
- view_BonusBalances - bonus balances per user/campaign
- view_CurrentBonusBalances - current active bonus balances
- view_BonusFreebets - freebet data

### Bets Views
- view_Bets - individual bet data (Stake, Odds, Grouping, Winnings)
- view_Betslips - betslip master (UserID, Type, Status, Stake, Winnings, ApplicationType)
- view_BetslipAdditionalData - additional betslip data
- view_BetslipsIdentifiers - betslip identifiers
- view_BookedBetslips - booked betslips
- view_BookedBetslipsDetails - booked betslip details
- view_HistoricalBetslips - betslip status history
- view_BetslipsOdds - betslip-odds connection

### Games
- view_Casino - casino data by provider/user/date (Stake, Winnings, BetsNumber)

### Commissions
- view_SportDirectCommissions
- view_SportNetworkCommissions
- view_CasinoDirectCommissions
- view_CasinoNetworkCommissions
- view_PokerDirectCommissions
- view_PokerNetworkCommissions

### Event Program
- view_Sports, view_SportsDetails
- view_Groups, view_Events, view_EventsAdditionalData
- view_SubEvents, view_SubEventsAdditionalData
- view_OddsClasses, view_OddsTypes, view_Odds

## Key Lookup Tables
- Betslip Statuses: 1=Under insert, 2=Bets inserted, 10=In Progress, 40=To be paid, 50=Paid-Closed
- Betslip Types: 1=Normal, 2=Live, 3=Mixed
- Bet Types: 1=Single, 2=Split, 3=Combined, 4=Multiple
- User Statuses: 1=Enabled, 2=Disabled, 3=Deleted, 4=Be Validated, 5=Frozen
- User Types: 0=Users, 20=Agents, 40=Administrators, 254=Company
- Credit Types: 1=User Account, 2=Bonus, 3=Freebets
- Outcome Types: 1=Winning, 2=Losing, 3=In Progress, 4=Cancelled
- Currencies: 1=Euro, 11=Naira, 13=Ghanian Cedi, 18=Zambian Kwacha, 27=Ugandan Shilling, 31=Kenyan Shilling
- Sport Types: 1=Soccer, 2=Basket, 4=Tennis, 43=Horse Racing, etc.
- Casino Types: 1=Casino, 4=Virtual Games

## Core Data Domains (from Playa Bets Assessment)
1. Player & Identity Data - lifecycle, sessions, self-exclusion, compliance
2. Betting & Event Data - events, odds, bet lineage, outcomes
3. Financial Transactions & Balances - deposits, withdrawals, currency
4. Bonuses & Campaigns - promotions, redemption, ROI
5. Compliance, Audit & Risk - logs, audit trails, duplicate detection

## GitHub Repo
- marilu1981/playabets
