# Playa Bets Dashboard — Deployment Architecture Recommendation

> Prepared for internal review · February 2026

---

## The Core Question

You have three variables to optimise: **where the backend runs**, **where the frontend is served**, and **how authentication works**. Since the client already operates on AWS, the cleanest answer is to keep everything inside that ecosystem rather than splitting across AWS and Vercel. Below is the full reasoning, followed by a concrete recommended architecture and a secondary option if Vercel is preferred for the frontend.

---

## Option A — Fully AWS-Native (Recommended)

This is the cleanest approach for a client that already has AWS infrastructure, an existing VPC, and a DWH that lives in RDS. Keeping everything inside one cloud eliminates cross-cloud egress costs, simplifies IAM policy management, and avoids the need to punch holes in the VPC perimeter for an external frontend.

### Frontend: AWS Amplify Hosting or CloudFront + S3

The React/Vite frontend is a static build. It can be deployed to **S3 + CloudFront** (the standard AWS static hosting pattern) or to **AWS Amplify Hosting**, which is essentially a managed wrapper around that same pattern with a built-in CI/CD pipeline connected to GitHub. Amplify Hosting supports custom domains, automatic HTTPS via ACM, and preview deployments per branch — matching everything Vercel offers, but without leaving AWS.

**Why not Vercel?** Vercel is excellent, but it introduces a second cloud vendor, and more importantly it means the frontend's API calls must traverse the public internet to reach the FastAPI backend inside the client's VPC. That requires either a public-facing API Gateway or a NAT gateway, both of which add latency, cost, and attack surface. Keeping the frontend on CloudFront means it can call the backend via an internal Application Load Balancer (ALB) URL, or at minimum via a tightly scoped API Gateway with VPC Link.

### Backend: ECS Fargate (Recommended) or EC2

The FastAPI application is a containerised Python service. **ECS Fargate** is the right home for it: no servers to manage, scales to zero when idle, and integrates natively with IAM task roles (so the container never needs hardcoded credentials). The scheduler (`src/scheduler.py`) should run as a separate Fargate task triggered by **Amazon EventBridge Scheduler** on a cron expression rather than as a long-running `time.sleep` loop — this is more resilient and costs nothing when not running.

The Parquet serving files (`data/serving/`) should be stored on **Amazon EFS** (Elastic File System) mounted into both the API container and the scheduler container, so the scheduler can write fresh Parquets and the API can read them without any S3 round-trips. Alternatively, for larger data volumes, store the Parquets in **S3** and have the API read them directly using `pandas.read_parquet("s3://...")` — this is slightly slower on cold reads but eliminates the need for EFS.

### Data Pipeline: The Scheduler as a Fargate Scheduled Task

The current `scheduler.py` uses `time.sleep`. In production, replace this with an **EventBridge Scheduler rule** that triggers a Fargate task every 2 hours. This means:

- No long-running process to monitor or restart.
- Each pipeline run gets a fresh container with a clean environment.
- Failures are visible in CloudWatch Logs and can trigger SNS alerts.

### Authentication: Amazon Cognito + JWT

For an internal analytics dashboard accessed by a small team (analysts, management), **Amazon Cognito User Pools** is the right choice. It provides:

- Hosted login UI (no custom auth pages needed initially).
- MFA support (TOTP or SMS).
- JWT tokens (ID token + access token) that the frontend stores in memory and sends as `Authorization: Bearer <token>` headers.
- Integration with the ALB via **Cognito Authorizer** — the ALB can validate the JWT before the request even reaches the FastAPI container, so unauthenticated requests are rejected at the load balancer layer.

The FastAPI app itself should also validate the JWT on every request using `python-jose` or `jwcrypto`, reading the Cognito JWKS endpoint. This provides defence-in-depth: even if someone bypasses the ALB, the API rejects unsigned tokens.

For the frontend, use the **AWS Amplify Auth** library (wraps Cognito) or the lighter `amazon-cognito-identity-js` package directly. The login flow is: user submits credentials → Cognito returns JWT → frontend stores in `sessionStorage` (not `localStorage`, to reduce XSS exposure) → every API call includes the token.

---

## Option B — FastAPI on AWS, Frontend on Vercel

If the team strongly prefers Vercel's developer experience (instant preview deployments, zero-config CI/CD, edge network), this is workable but requires one additional component.

The FastAPI backend cannot be called directly from Vercel's edge network if it lives inside a private VPC subnet. The solution is to place an **API Gateway (HTTP API) with VPC Link** in front of the ALB. This creates a public HTTPS endpoint for the API that is still protected by Cognito JWT authorisation at the API Gateway level.

The tradeoff is added latency (~5–15 ms for the VPC Link hop), an additional AWS service to manage, and cross-cloud egress costs for every API response. For a low-traffic internal dashboard these costs are negligible, but the architectural complexity is real.

Authentication in this option works identically — Cognito User Pool, JWT tokens, API Gateway JWT Authorizer.

---

## Architecture Comparison

| Dimension | Option A (Full AWS) | Option B (AWS + Vercel) |
|---|---|---|
| **Frontend hosting** | CloudFront + S3 or Amplify | Vercel |
| **Backend hosting** | ECS Fargate behind ALB | ECS Fargate behind ALB + API Gateway |
| **Auth** | Cognito → ALB Authorizer | Cognito → API Gateway JWT Authorizer |
| **Scheduler** | EventBridge → Fargate task | EventBridge → Fargate task |
| **Data storage** | EFS or S3 for Parquets | EFS or S3 for Parquets |
| **VPN requirement** | Eliminated (internal ALB) | Eliminated (public API Gateway) |
| **Cross-cloud egress** | None | Yes (Vercel → AWS per request) |
| **Complexity** | Lower | Higher (VPC Link, API Gateway) |
| **DX / preview deploys** | Good (Amplify) | Excellent (Vercel) |
| **Estimated monthly cost (low traffic)** | ~$30–60 | ~$40–80 |

---

## Recommended Stack (Option A, Concrete Services)

```
┌─────────────────────────────────────────────────────────┐
│  AWS Account (Client VPC)                               │
│                                                         │
│  Route 53 → CloudFront → S3 (React build)              │
│                    │                                    │
│                    ▼ (API calls, same domain /api/*)    │
│             Application Load Balancer                   │
│               │  Cognito JWT Authorizer                 │
│               ▼                                         │
│          ECS Fargate (FastAPI container)                │
│               │                                         │
│               ├── EFS mount (Parquet serving files)     │
│               └── Secrets Manager (DWH credentials)    │
│                                                         │
│  EventBridge Scheduler (every 2h)                       │
│               ▼                                         │
│          ECS Fargate (scheduler task)                   │
│               │                                         │
│               ├── EFS mount (write Parquets)            │
│               └── RDS (SQL Server DWH — existing)       │
│                                                         │
│  Amazon Cognito User Pool (auth)                        │
│  CloudWatch Logs + Alarms (observability)               │
│  AWS Secrets Manager (DWH_USER, DWH_PASS)              │
└─────────────────────────────────────────────────────────┘
```

A key detail: by serving the React app from CloudFront and routing `/api/*` requests through the same CloudFront distribution to the ALB, the frontend and backend share a single domain. This eliminates CORS entirely — the browser sees one origin. The CloudFront behaviour rule for `/api/*` forwards to the ALB origin; everything else serves from S3.

---

## Authentication Flow (Step by Step)

1. User navigates to `https://dashboard.playabets.com`.
2. CloudFront serves the React SPA from S3.
3. The app checks for a valid Cognito session token in `sessionStorage`. If absent, it redirects to the Cognito Hosted UI login page.
4. User authenticates (username + password + optional MFA). Cognito issues an ID token and access token (JWTs, 1-hour expiry) and a refresh token (30-day expiry).
5. The app stores the tokens in `sessionStorage` and redirects back to the dashboard.
6. Every API call includes `Authorization: Bearer <access_token>`.
7. The ALB's Cognito Authorizer validates the JWT signature against Cognito's JWKS endpoint. Invalid or expired tokens receive a `401` before reaching the container.
8. The FastAPI app performs a secondary JWT validation as defence-in-depth.
9. When the access token expires, the Amplify Auth library silently refreshes it using the refresh token — the user never sees a login prompt during an active session.

---

## What Needs to Change in the Codebase

The changes required to move from the current local setup to this architecture are modest.

**Backend (`playabets` repo):**

- Replace `time.sleep` loop in `scheduler.py` with a simple `main()` that runs the pipeline once and exits — EventBridge handles the scheduling.
- Add a `Dockerfile` for the FastAPI app and a separate one (or the same image) for the scheduler task.
- Replace hardcoded `DWH_USER` / `DWH_PASS` env var reads with `boto3` calls to AWS Secrets Manager (or keep env vars and inject them from Secrets Manager via ECS task definition — the simpler approach).
- Add JWT validation middleware to `app.py` using `python-jose`.
- Change Parquet paths from local filesystem to either EFS mount paths (transparent — no code change if the mount path matches) or S3 URIs using `pandas.read_parquet("s3://bucket/path")`.

**Frontend (`playabets-dashboard` repo):**

- Install `aws-amplify` and configure `Amplify.configure()` with the Cognito User Pool ID and App Client ID.
- Wrap the app in an `Authenticator` component (or implement a custom login page using `Auth.signIn()`).
- Change `API_BASE` in `api.ts` from `http://localhost:8080` to `/api` (relative path, since frontend and backend share the same CloudFront domain).
- Flip `API_ENABLED = true`.

---

## On the VPN Question

Once this architecture is deployed, **the VPN is no longer needed for the dashboard to function**. The scheduler task runs inside the VPC and connects to the RDS DWH directly over the private network. The API reads from EFS/S3 — no DWH connection at query time. The frontend calls the API over HTTPS with JWT auth. The only remaining use for the VPN would be direct developer access to the RDS instance for ad-hoc queries.

---

## Summary Recommendation

Go with **Option A (fully AWS-native)**. The client already has the AWS account, the VPC, and the RDS instance. Adding Amplify Hosting, ECS Fargate, Cognito, and EventBridge Scheduler keeps everything in one place, eliminates the VPN dependency, and delivers a production-grade auth and deployment setup with a relatively small amount of infrastructure code (manageable with a single Terraform or CDK module). The developer experience with Amplify Hosting is close enough to Vercel for an internal tool of this scale.

Only choose Option B if the frontend team has a strong existing Vercel workflow and the additional API Gateway + VPC Link complexity is acceptable.
