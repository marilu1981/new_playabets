# Playa Bets Dashboard — Azure Self-Contained Deployment

> Prepared for internal review · February 2026

---

## The Situation

The client runs their DWH on SQL Server hosted in AWS, but access to that AWS environment may be restricted or difficult to negotiate. The question is whether the entire analytics stack — data pipeline, API, and frontend — can be moved to a **separate Azure subscription that you control**, pulling data out of the client's SQL Server over a secure connection, and hosting everything independently.

The short answer is: **yes, and it is arguably the better arrangement for a consultant**. You own the Azure subscription, you control the deployment, and the client simply grants you a read-only SQL Server connection. No AWS IAM politics, no waiting for someone to provision resources.

There is also a natural alignment here: the client's DWH is SQL Server, which is a Microsoft product. Azure has native, first-class support for SQL Server connectivity, and the tooling around it (Azure Data Factory, Azure SQL, SSMS) is mature and well-understood by most SQL Server DBAs.

---

## The Two Connection Scenarios

Before choosing an architecture, the first thing to clarify with the client is **how the SQL Server is exposed**. This determines how the pipeline connects to it.

| Scenario | What it means | What you need from the client |
|---|---|---|
| **A — Public endpoint with IP allowlist** | SQL Server has a public IP or DNS name; connections are filtered by IP | Client whitelists your Azure outbound IP range |
| **B — VPN or ExpressRoute** | SQL Server is private; you connect via a site-to-site VPN or Azure ExpressRoute | Client sets up a VPN gateway (more work for them) |
| **C — Scheduled data export** | Client's team exports a CSV/Parquet dump on a schedule and drops it in a shared location (SFTP, S3 bucket, SharePoint) | Minimal — just a read-only export job on their side |

**Scenario A** is the most common for a consultant arrangement and requires the least client involvement beyond a firewall rule. **Scenario C** is the fallback if even that is too much to ask — the pipeline simply reads files instead of querying SQL Server directly. The codebase already supports this because the extract scripts write Parquet files; you could just swap the source from a live SQL query to a pre-delivered file.

---

## Recommended Azure Architecture

The following assumes Scenario A (direct SQL Server connection over a public endpoint with IP allowlist). The same architecture works for Scenario C with the extract scripts replaced by file readers.

```
┌─────────────────────────────────────────────────────────────┐
│  Your Azure Subscription                                    │
│                                                             │
│  Azure Static Web Apps (React frontend)                     │
│    └── Custom domain (dashboard.playabets.com)              │
│    └── Built-in auth via Azure AD B2C or Entra ID           │
│                 │                                           │
│                 ▼ (API calls to /api/*)                     │
│  Azure Container Apps (FastAPI)                             │
│    └── Ingress: HTTPS, JWT-protected                        │
│    └── Reads Parquet files from Azure Blob Storage          │
│                                                             │
│  Azure Container Apps Job (Scheduler)                       │
│    └── Triggered by Azure Container Apps Jobs on cron       │
│    └── Connects to client SQL Server (read-only)            │
│    └── Writes Parquet files to Azure Blob Storage           │
│                                                             │
│  Azure Blob Storage (data/serving/ Parquets)                │
│  Azure Key Vault (SQL Server credentials)                   │
│  Azure Monitor + Log Analytics (observability)              │
│  Azure AD B2C or Entra External ID (auth)                   │
└─────────────────────────────────────────────────────────────┘
         │ read-only SQL connection (port 1433, IP-allowlisted)
         ▼
┌─────────────────────────────────────────────────────────────┐
│  Client's AWS Environment                                   │
│  SQL Server DWH (existing)                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Component Breakdown

### Frontend: Azure Static Web Apps

Azure Static Web Apps is the Azure equivalent of Vercel or Amplify Hosting. It serves the React/Vite build from a global CDN, supports custom domains with automatic HTTPS, and has a GitHub Actions CI/CD integration that deploys on every push to `main`. Critically, it has **built-in authentication support** — you can require login before the app loads with a single configuration file, no custom auth code needed for basic scenarios.

For a more controlled login experience (branded login page, user management, MFA), pair it with **Azure AD B2C** (free tier covers up to 50,000 monthly active users, which is more than enough for an internal tool). Users log in with email + password, receive a JWT, and every API call carries that token.

### Backend API: Azure Container Apps

Azure Container Apps is the managed container platform on Azure — conceptually similar to AWS ECS Fargate. It runs the FastAPI Docker container, scales to zero when idle (so you pay nothing outside business hours), and exposes an HTTPS ingress endpoint. The JWT from Azure AD B2C is validated at the ingress layer before the request reaches the container.

The API reads Parquet files from Azure Blob Storage using `pandas.read_parquet("abfs://container@account.dfs.core.windows.net/path")` via the `adlfs` Python library, or more simply by mounting the Blob container as a filesystem using the Azure Files integration. No database connection at query time — the API is purely a Parquet reader and aggregator.

### Scheduler: Azure Container Apps Jobs

Rather than a long-running process, the scheduler runs as an **Azure Container Apps Job** on a cron schedule (every 2 hours). This is the Azure equivalent of the EventBridge + Fargate task pattern from the AWS architecture. The job container:

1. Connects to the client's SQL Server using `pyodbc` (same code as today).
2. Runs the incremental extract scripts.
3. Runs the KPI transform scripts.
4. Writes updated Parquet files to Azure Blob Storage.
5. Exits cleanly.

The `scheduler.py` change required is the same as noted in the AWS document: remove the `while True` loop and make `main()` run once and exit. The cron schedule lives in the Azure Container Apps Job configuration, not in Python code.

### Data Storage: Azure Blob Storage

The Parquet serving files (`data/serving/`) move from local filesystem to an Azure Blob Storage container. This is a one-line change in the Python code — replace local paths with `abfs://` URIs. The scheduler writes to Blob; the API reads from Blob. Both use a Managed Identity (no hardcoded credentials) to authenticate to the storage account.

### Secrets: Azure Key Vault

The SQL Server username and password are stored in Azure Key Vault. The Container Apps environment injects them as environment variables at runtime using a Key Vault reference — no secrets in code, no secrets in environment variable files.

---

## Authentication: Three Options Ranked

### Option 1 — Azure AD B2C (Recommended for most cases)

Azure AD B2C is a standalone identity service that works independently of the client's own Microsoft tenant. You create your own B2C tenant (free), define user flows (sign-in, password reset, MFA), and issue JWTs. Users are managed entirely by you. The client has no involvement in user management.

This is the right choice if: the client does not have a Microsoft 365 / Entra ID tenant, or if you want to manage access independently without relying on the client's IT department.

**Cost:** Free up to 50,000 MAU. Effectively zero for an internal dashboard.

### Option 2 — Microsoft Entra External ID (formerly Azure AD B2C v2)

The newer, more polished successor to B2C. Same concept — your own tenant, you manage users — but with a better developer experience and a more modern admin portal. If starting fresh today, this is slightly preferable to B2C, though B2C is more widely documented.

### Option 3 — Microsoft Entra ID (if client has M365)

If the client already uses Microsoft 365 (which many businesses do), their staff already have Entra ID (formerly Azure AD) accounts. You can register the dashboard as an **Enterprise Application** in their tenant and use those existing credentials for login. This means users log in with their work email and password — no new accounts to create.

The tradeoff is that you need the client's IT admin to register the app in their tenant and grant consent. For a non-technical client this may be more friction than it is worth, but if they have an IT person it is the smoothest user experience.

---

## What the Client Needs to Provide

This is the minimal ask for the client, regardless of their technical level:

| Item | What to ask for | Who typically handles it |
|---|---|---|
| SQL Server hostname / IP | The address of the DWH server | Their DBA or IT person |
| SQL Server read-only credentials | A username + password with `SELECT` on `Dwh_en.*` | Their DBA |
| Firewall rule | Allow inbound port 1433 from your Azure outbound IP | Their DBA or network team |
| (Optional) Domain DNS record | A CNAME pointing `dashboard.playabets.com` to the Azure Static Web App URL | Their IT person or domain registrar |

That is it. No AWS access required. No VPN setup. No infrastructure changes on their side beyond a single firewall rule.

---

## Comparison: AWS (Full) vs Azure (Self-Contained) vs Vercel + AWS

| Dimension | AWS Full | Azure Self-Contained | Vercel + AWS |
|---|---|---|---|
| **Requires AWS access** | Yes (full) | No | Yes (partial) |
| **Client involvement** | High | Minimal (firewall rule only) | Medium |
| **Frontend** | CloudFront / Amplify | Azure Static Web Apps | Vercel |
| **Backend** | ECS Fargate | Azure Container Apps | ECS Fargate |
| **Auth** | Cognito | Azure AD B2C / Entra | Cognito |
| **SQL Server affinity** | Neutral | Native (Microsoft stack) | Neutral |
| **You control the infra** | No (client's account) | Yes (your subscription) | Partial |
| **Estimated monthly cost** | $30–60 | $25–55 | $40–80 |
| **Best for** | Client grants full AWS access | Consultant-owned deployment | Vercel-first teams |

---

## Migration Path from Current Codebase

The changes to move from the current local setup to Azure are small and well-contained.

**Python backend (`playabets` repo):**

```python
# 1. In scheduler.py — remove the loop, run once:
if __name__ == "__main__":
    run_pipeline()  # exits after completion; Azure cron handles scheduling

# 2. In io_utils.py — add Blob Storage write support:
import adlfs
storage_options = {"account_name": os.environ["AZURE_STORAGE_ACCOUNT"],
                   "account_key": os.environ["AZURE_STORAGE_KEY"]}
df.to_parquet("abfs://serving/daily_kpis.parquet", storage_options=storage_options)

# 3. In app.py — add JWT validation middleware:
# Validate Azure AD B2C tokens using python-jose + JWKS endpoint
```

**Frontend (`playabets-dashboard` repo):**

```typescript
// api.ts
const API_BASE = "/api";       // relative — same domain via Static Web Apps routing
const API_ENABLED = true;

// main.tsx — wrap app with MSAL provider (Microsoft Authentication Library)
import { MsalProvider } from "@azure/msal-react";
```

The `staticwebapp.config.json` file (added to the repo root) handles routing rules and auth configuration for Azure Static Web Apps — this is a single JSON file that replaces the CloudFront behaviour rules from the AWS approach.

---

## Practical Next Steps

1. **Clarify the connection scenario** with the client: can they give you a read-only SQL Server login and whitelist an IP? If yes, proceed with Scenario A. If not, ask if they can set up a scheduled CSV/Parquet export (Scenario C).

2. **Create a free Azure account** (or use an existing one). The services used here (Container Apps, Static Web Apps, Blob Storage, Key Vault, B2C) all have generous free tiers and the total cost at low traffic is well under $60/month.

3. **Add a `Dockerfile`** to the `playabets` repo (one image, two entry points — API and scheduler job).

4. **Add `staticwebapp.config.json`** to the `playabets-dashboard` repo to configure routing and auth.

5. **Deploy** using GitHub Actions (both repos already have the right structure for this).

The document `docs/deployment-architecture.md` in this repo covers the AWS-native approach for comparison. This document covers the Azure self-contained approach, which is likely the more practical path given the client access constraints.
