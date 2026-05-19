# MedBroker — Free Deployment Guide
## Get a live testable URL in under 30 minutes

This guide gets the React frontend live on Vercel at no cost, with auth
bypassed in preview mode. You can share the URL with the client and
demonstrate every page and role using the role switcher.

A separate section covers adding the Azure backend (API + database) when
you are ready to test with real data.

---

## Phase 1 — Frontend only (30 minutes, free forever)

This is the fastest path to a shareable URL. Auth is bypassed, all data
is mocked, and the role switcher in the sidebar lets you demonstrate all
four roles.

### Prerequisites

- A GitHub account (free)
- A Vercel account connected to GitHub (free) — sign up at vercel.com

### Steps

**1. Push the code to GitHub**

```bash
# From the medbroker project root
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/medbroker.git
git push -u origin main
```

**2. Import the project on Vercel**

1. Go to vercel.com → New Project
2. Import your GitHub repository
3. Set the **Root Directory** to `frontend`
4. Vercel will auto-detect Vite — accept the defaults
5. Click Deploy

Vercel reads `frontend/vercel.json` automatically. The build command,
output directory, and SPA routing rewrite are already configured there.

**6. Your app is live**

Vercel will give you a URL like:
`https://medbroker-xyz.vercel.app`

Every push to `main` triggers an automatic redeploy.

---

## Phase 2 — Add Azure backend (free tier)

When you want real API calls and a real database, add these Azure resources.
All fit within Azure's permanently free tiers.

### Azure resources required

| Resource | Free tier | Notes |
|---|---|---|
| Azure Functions (Consumption) | 1M calls/month free | Your API |
| Azure SQL Serverless | 32 GB, 100k vCore-seconds/month | Your database |
| Azure Entra ID External | 50k MAU free | Authentication |
| Azure Static Web Apps | Free plan | Alternative to Vercel |

### Steps

**1. Create a free Azure account**

Go to azure.microsoft.com/free. You get USD 200 credit for 30 days plus
permanent free tiers. You do not need a credit card for the free tiers —
but Azure does require one to activate the account.

**2. Deploy the Azure infrastructure**

```bash
# Install Azure CLI if not already installed
# https://docs.microsoft.com/en-us/cli/azure/install-azure-cli

# Log in
az login

# Create a resource group
az group create --name medbroker-dev --location southafricanorth

# Deploy the Bicep template
az deployment group create \
  --resource-group medbroker-dev \
  --template-file infra/main.bicep \
  --parameters @infra/parameters/dev.json
```

**3. Deploy the database schema**

```bash
# Get the SQL server name from the deployment output
# Connect in Azure Data Studio or SSMS and run:
# 1. infra/schema.sql        (main schema)
# 2. infra/feature-flags.sql (feature flag table and seed data)
```

**4. Set environment variables**

In the Azure Functions app, set these Application Settings:

```
DATABASE_URL       = <connection string from Azure SQL>
ENTRA_TENANT_ID    = <your Entra tenant ID>
ENTRA_CLIENT_ID    = <your app registration client ID>
KEY_VAULT_URL      = <your Key Vault URL>
```

In Vercel, set these Environment Variables:

```
VITE_API_BASE_URL    = https://your-functions-app.azurewebsites.net/api
VITE_ENTRA_CLIENT_ID = <your app registration client ID>
VITE_ENTRA_AUTHORITY = https://login.microsoftonline.com/<tenant-id>
```

**5. Remove the auth bypass**

In `frontend/src/App.jsx`, swap the `RoleProvider` for the real MSAL
authentication wrapper. The `authConfig.js` file already has the correct
MSAL configuration — you just need to add your real client ID and authority.

**6. Deploy the API**

```bash
cd api
npm install
func azure functionapp publish <your-function-app-name>
```

---

## Enabling Feature Flags

Once the backend is connected, the frontend fetches flags from
`GET /api/flags` on startup. The Feature Flags admin page (Admin →
Feature Flags) lets you toggle features without a code deployment.

Key flags to set at onboarding:

| Flag | Setting |
|---|---|
| `auth.sso.enabled` | `true` when Entra ID is configured |
| `auth.sso.provider` | `microsoft` |
| `appointments.claimModel` | `assign` initially; switch to `claim` for Phase 2 |
| `events.enabled` | `true` if the client runs events |
| `notifications.email.enabled` | `true` after ACS is configured |

---

## Cost summary

| Phase | Monthly cost |
|---|---|
| Phase 1 — Vercel frontend only | R0 |
| Phase 2 — Vercel + Azure free tier | R0 (within free limits) |
| Production (>50k MAU, >1M function calls) | Re-estimate required |

The Azure free tiers are permanent — they do not expire after 30 days.
Only usage above the free limits is billed.
