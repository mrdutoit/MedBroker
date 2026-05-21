# MedBroker — Lead Management System

Specialist insurance lead management for a South African brokerage selling personal,
practice, and malpractice insurance to medical doctors.

**Stack:** React (Vite) + Node.js (Azure Functions v4) + Azure SQL Serverless  
**Auth:** Azure Entra ID External (Microsoft 365 SSO, flag-configurable)  
**Calendar:** Microsoft 365 Graph API (broker availability — no Calendly required)  
**Region:** South Africa North (`southafricanorth`) — POPIA data residency

---

## What this system does

MedBroker replaces a Google Sheets operation and manages the full pipeline from
lead import through to policy sign-off. Key capabilities:

- **Lead management** — import via CSV batch, medical subscription feed, or manual
  entry; agent call logging with automatic status transitions; appointment booking
  with broker ranking via M365 Calendar API
- **Appointment pipeline** — dual workflow models (assign and claim); broker meeting
  tracking (up to three meetings); outcome recording with products sold
- **Task management** — system-generated tasks from appointment events; manual task
  creation; due date tracking; role-based visibility
- **Reports** — Monthly/Quarterly/Yearly period selector; broker and agent
  drill-down pages; pipeline funnel and trend charts
- **Feature flags** — per-deployment configuration via GlobalAdmin; three tiers
  (Core, Operational, Phase 2); no deployment required to change flags
- **FAIS/POPIA compliance** — soft-delete throughout; audit log; data residency
  enforced in `southafricanorth`

---

## Repository structure

```
medbroker-v1/
├── frontend/               React (Vite) — all UI
│   ├── src/
│   │   ├── context/        RoleContext.jsx, FlagContext.jsx
│   │   ├── hooks/          useFetch.js, useWindowSize.js
│   │   ├── pages/          All page components
│   │   ├── services/       api.js (preview-safe), authConfig.js
│   │   └── styles/         tokens.js (shared design tokens)
│   └── vercel.json         SPA rewrite rule — mandatory for Vercel
│
├── api/                    Azure Functions v4 backend (Node.js ES Modules)
│   └── src/
│       ├── functions/      HTTP-triggered Azure Functions
│       ├── services/       Business logic (leadStatusService.js, etc.)
│       └── middleware/     JWT auth validation
│
├── mobile/                 React Native (Expo) — student QR registration screen
│
├── infra/                  Bicep infrastructure as code
│   ├── schema.sql          Azure SQL schema v2.2 (all tables + seed data)
│   ├── feature-flags.sql   17 seeded feature flags (3 tiers)
│   └── main.bicep          All Azure resources
│
└── DEPLOYMENT.md           Production deployment checklist
```

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 20 LTS | https://nodejs.org |
| Azure CLI | Latest | https://learn.microsoft.com/cli/azure/install-azure-cli |
| Azure Functions Core Tools | v4 | `npm install -g azure-functions-core-tools@4` |
| Git | Any | https://git-scm.com |

---

## Testing deployment (Vercel — no backend required)

The frontend runs entirely on mock data and requires no environment variables
or backend connection for preview and client demonstration.

1. Push the repository to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project → Import your repo
3. Set **Root Directory** to `medbroker-v1/frontend`
4. Leave all environment variables blank
5. Deploy — live within 90 seconds

The role switcher in the sidebar footer lets you switch between all five roles
(GlobalAdmin, Admin, Supervisor, Agent, Broker) to demonstrate role-specific views.

---

## Local development setup

### 1. Clone and install

```bash
git clone https://github.com/mrdutoit/MedBroker.git
cd MedBroker/medbroker-v1/frontend
npm install
npm run dev
```

Frontend starts at `http://localhost:5173` in preview mode (mock data, no API needed).

### 2. Configure the API (when backend is ready)

```bash
cd ../api
cp .env.example .env
npm install
```

Edit `.env` with your values (see Environment Variables section below), then:

```bash
func start
```

API starts at `http://localhost:7071/api`.

### 3. Create the database schema

Connect to your Azure SQL database via Azure Data Studio or SSMS, then run:

```bash
infra/schema.sql          # Creates all tables, constraints, indexes
infra/feature-flags.sql   # Seeds 17 feature flags with defaults
```

---

## Production deployment to Azure

See `DEPLOYMENT.md` for the full step-by-step checklist. The high-level sequence:

1. `az login` and select your subscription
2. Deploy Bicep: `az deployment group create --template-file infra/main.bicep`
3. Run `schema.sql` and `feature-flags.sql` against the provisioned Azure SQL database
4. Set environment variables on the Function App (see below)
5. Configure Entra ID External — create app registration, set redirect URI
6. Add GitHub Actions secrets and push to `main` to trigger CI/CD
7. Set Vercel environment variables to switch from mock data to live API

---

## Environment variables

### Frontend (`frontend/.env.local` for local dev, Vercel project settings for production)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_BASE_URL` | Production only | Azure Functions URL + `/api` e.g. `https://medbroker-api.azurewebsites.net/api` |
| `VITE_CLIENT_ID` | Production only | Entra ID app registration client ID |
| `VITE_AUTHORITY` | Production only | `https://login.microsoftonline.com/{tenant-id}` |

When `VITE_CLIENT_ID` is not set, the frontend runs in preview mode with mock data.
No code change is required to switch from preview to production — set the variables
and redeploy.

### API (`api/.env`)

| Variable | Required | Description |
|---|---|---|
| `DB_SERVER` | Yes | Azure SQL server FQDN |
| `DB_NAME` | Yes | Database name |
| `DB_USE_PASSWORD` | Dev only | `true` to use SQL auth locally |
| `DB_USER` / `DB_PASSWORD` | Dev only | SQL credentials (never use in production) |
| `KEY_VAULT_URL` | Yes | Azure Key Vault URI |
| `KEY_VAULT_ENC_KEY_NAME` | Yes | Key name for field-level encryption |
| `ENTRA_TENANT_ID` | Yes | Azure Entra tenant ID |
| `ENTRA_CLIENT_ID` | Yes | Azure Entra app client ID |
| `ACS_CONNECTION_STRING` | Optional | Azure Communication Services (email notifications — Phase 2) |
| `MAX_CALL_ATTEMPTS` | Optional | Calls before Uncontactable (default: 3) |

---

## Feature flags

Feature flags are managed by the **GlobalAdmin** role via **Admin → Feature Flags**.
No deployment is required to change a flag — changes take effect immediately.

| Tier | Purpose |
|---|---|
| **Core** | Fundamental behaviour that varies between customers. Review at onboarding. |
| **Operational** | UI and workflow preferences. Can be changed at any time. |
| **Phase 2** | Features not yet implemented. Toggling has no effect until Phase 2 deploys. |

Key flags:

| Flag | Tier | Default | Controls |
|---|---|---|---|
| `auth.sso.enabled` | Core | false | Microsoft 365 SSO vs standalone auth |
| `appointments.claimModel` | Core | assign | `assign` (admin allocates) vs `claim` (broker self-selects) |
| `tasks.enabled` | Core | false | Task management page |
| `events.enabled` | Core | true | Events module visibility |
| `appointments.thirdMeeting.enabled` | Operational | false | Optional third meeting on Appointment Detail |
| `notifications.email.enabled` | Operational | false | Email dispatch via Azure Communication Services |

The **Feature Flags** nav item is only visible to the **GlobalAdmin** role.
It is never visible to the customer's Admin, Supervisor, Agent, or Broker users.

---

## Appointment workflow models

Two models are supported, configured via `appointments.claimModel`:

**Assign model** (`assign` — default): Admin and Supervisor allocate brokers to
appointments. Assign and Reassign buttons appear on the Appointments list.

**Claim model** (`claim`): Brokers self-select appointments from an Available to Claim
queue. Each broker has a monthly free allocation (`brokerFreeAppointmentsPerMonth`,
configurable in App Admin → System Settings). Additional claims cost tokens.

---

## POPIA compliance notes

This system processes personal information of medical professionals under POPIA.

- Data residency enforced by deploying exclusively to `southafricanorth` (Johannesburg)
- Soft-delete pattern throughout — records are excluded from queries but retained for
  FAIS Act audit requirements
- Audit log table (`AuditLog`) records all significant actions — viewable in
  App Admin → Audit Log
- Subject access requests: admin endpoint not yet built (flag: `popia.subjectAccessRequest.enabled`)
- Information Officer name and contact required from client for privacy notice

---

## Architecture document

See `MedBroker-Architecture-Design-Spec-v1.1.docx` for the full specification
including data model, API contracts, POPIA compliance checklist, and five-persona
design review.
