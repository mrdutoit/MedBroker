# MedBroker — Lead Management System

Specialist insurance lead management for a South African brokerage selling personal,
practice, and malpractice insurance to medical doctors.

**Stack:** React (Vite) + Node.js (Azure Functions v4) + Azure SQL Serverless
**Auth:** Azure Entra ID External
**Region:** South Africa North (`southafricanorth`) — POPIA data residency

---

## Repository Structure

```
medbroker/
├── api/                    Azure Functions v4 backend (Node.js ES Modules)
│   ├── src/
│   │   ├── functions/      HTTP-triggered Azure Functions (one file per resource)
│   │   ├── services/       Business logic and data access
│   │   ├── middleware/     JWT auth validation
│   │   └── models/         Zod validation schemas
│   └── .env.example        All required API environment variables
│
├── frontend/               React frontend (Vite)
│   ├── src/
│   │   ├── pages/          Page components (LeadList, LeadDetail, Events, etc.)
│   │   ├── services/       API client (api.js) and auth config (authConfig.js)
│   │   └── hooks/          Custom React hooks (useFetch)
│   └── .env.example        All required frontend environment variables
│
├── mobile/                 React Native mobile app (Expo) — student QR registration
│   └── src/screens/        RegisterScreen — QR scan + registration form
│
├── infra/                  Bicep infrastructure as code
│   ├── main.bicep          All Azure resources in one file
│   └── parameters/         dev.json and prod.json
│
└── .github/workflows/      GitHub Actions CI/CD pipelines
```

---

## Prerequisites

Before you start, install the following:

| Tool | Version | Install |
|---|---|---|
| Node.js | 20 LTS | https://nodejs.org |
| Azure CLI | Latest | https://learn.microsoft.com/en-us/cli/azure/install-azure-cli |
| Azure Functions Core Tools | v4 | `npm install -g azure-functions-core-tools@4` |
| Git | Any | https://git-scm.com |

You will also need:
- An Azure subscription (free tier is fine for dev)
- A GitHub account (for CI/CD)
- An Azure Entra ID External tenant (free, set up via Azure Portal)

---

## Local Development Setup

### 1. Clone the repository

```bash
git clone https://github.com/your-org/medbroker.git
cd medbroker
```

### 2. Configure the API

```bash
cd api
cp .env.example .env
```

Open `.env` and fill in your values. For local dev, the minimum required variables are:

- `DB_SERVER` — your Azure SQL server hostname
- `DB_NAME` — database name (create it first — see step 4)
- `DB_USE_PASSWORD=true` — use SQL auth locally
- `DB_USER` and `DB_PASSWORD` — SQL login credentials
- `KEY_VAULT_URL` — your Azure Key Vault URI
- `ENTRA_TENANT_ID` and `ENTRA_CLIENT_ID` — from your Entra app registration

Install dependencies:

```bash
npm install
```

### 3. Configure the frontend

```bash
cd ../frontend
cp .env.example .env.local
```

Open `.env.local` and fill in:

- `VITE_ENTRA_CLIENT_ID` — same client ID as the API
- `VITE_ENTRA_AUTHORITY` — `https://login.microsoftonline.com/{your-tenant-id}`

Install dependencies:

```bash
npm install
```

### 4. Create the database schema

Connect to your Azure SQL database with Azure Data Studio or SSMS, then run
the schema script:

```sql
-- Run this in Azure Data Studio or SSMS against your medbroker database
-- Schema file location: infra/schema.sql (create this file — see note below)
```

> **Note:** A `schema.sql` migration file is not included in this scaffold.
> The schema is fully specified in the Stage 2 data model (ERD).
> Recommended approach: use the entity definitions from Section 5c of the
> Architecture and Design Specification to write the CREATE TABLE statements,
> or use an ORM migration tool like `db-migrate` to manage schema versions.

### 5. Start local development

Open two terminal windows:

**Terminal 1 — API (Azure Functions)**
```bash
cd api
func start
```

The API will start at `http://localhost:7071/api`

**Terminal 2 — Frontend**
```bash
cd frontend
npm run dev
```

The frontend will start at `http://localhost:5173`
Vite automatically proxies `/api` requests to the Functions runtime.

---

## First Deployment to Azure

### Step 1 — Log in to Azure

```bash
az login
az account list --output table
az account set --subscription "Your Subscription Name"
```

### Step 2 — Create a Resource Group

```bash
az group create \
  --name medbroker-rg \
  --location southafricanorth
```

### Step 3 — Deploy Infrastructure (Bicep)

Edit `infra/parameters/prod.json` and replace `REPLACE_WITH_4_CHAR_SUFFIX`
with a random 4-character lowercase string (e.g. `4f2a`).

```bash
cd infra
az deployment group create \
  --resource-group medbroker-rg \
  --template-file main.bicep \
  --parameters @parameters/prod.json
```

This deploys: Storage Account, Key Vault, Azure SQL, Function App, Static Web App.

### Step 4 — Note the deployment outputs

After the Bicep deployment completes, note these output values:

```bash
az deployment group show \
  --resource-group medbroker-rg \
  --name main \
  --query properties.outputs
```

You will need `functionAppUrl`, `staticWebAppUrl`, and `keyVaultUri`.

### Step 5 — Set remaining Function App settings

The Bicep template sets most variables. Add the remaining ones manually:

```bash
az functionapp config appsettings set \
  --resource-group medbroker-rg \
  --name medbroker-api-prod \
  --settings \
    ENTRA_TENANT_ID="your-tenant-id" \
    ENTRA_CLIENT_ID="your-client-id" \
    CALENDLY_API_TOKEN="your-token" \
    ZOHO_CLIENT_ID="your-id" \
    ZOHO_CLIENT_SECRET="your-secret" \
    ZOHO_REFRESH_TOKEN="your-token" \
    ACS_CONNECTION_STRING="your-connection-string"
```

### Step 6 — Grant the Function App access to Azure SQL

In Azure Portal → SQL Server → Microsoft Entra admin: set the Function App's
Managed Identity as an Entra user, then run:

```sql
-- Run in Azure Data Studio connected to your production database
CREATE USER [medbroker-api-prod] FROM EXTERNAL PROVIDER;
ALTER ROLE db_datareader ADD MEMBER [medbroker-api-prod];
ALTER ROLE db_datawriter ADD MEMBER [medbroker-api-prod];
```

### Step 7 — Create the Key Vault encryption key

```bash
# Create the field-level encryption key for Lead.id_number
az keyvault key create \
  --vault-name medbroker-kv-prod-XXXX \
  --name lead-id-number-key \
  --kty RSA \
  --size 2048
```

### Step 8 — Set up GitHub Actions secrets

In your GitHub repository → Settings → Secrets and variables → Actions, add:

| Secret | Value |
|---|---|
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | From Azure Portal → Static Web App → Manage deployment token |
| `AZURE_CREDENTIALS` | JSON from `az ad sp create-for-rbac` (see workflow file for command) |
| `AZURE_FUNCTION_APP_NAME` | `medbroker-api-prod` |
| `VITE_API_BASE_URL` | Your Function App URL + `/api` |
| `VITE_ENTRA_CLIENT_ID` | Your Entra client ID |
| `VITE_ENTRA_AUTHORITY` | `https://login.microsoftonline.com/{tenantId}` |

### Step 9 — Push to main to trigger deployment

```bash
git add .
git commit -m "Initial deployment"
git push origin main
```

GitHub Actions will build the frontend and API, and deploy both to Azure.

---

## Environment Variables Reference

### API (`api/.env.example`)

| Variable | Required | Description |
|---|---|---|
| `DB_SERVER` | Yes | Azure SQL server FQDN |
| `DB_NAME` | Yes | Database name |
| `DB_USE_PASSWORD` | Dev only | `true` to use SQL auth (local dev) |
| `DB_USER` / `DB_PASSWORD` | Dev only | SQL credentials (never use in production) |
| `KEY_VAULT_URL` | Yes | Azure Key Vault URI |
| `KEY_VAULT_ENC_KEY_NAME` | Yes | Key name for id_number encryption |
| `ENTRA_TENANT_ID` | Yes | Azure Entra tenant ID |
| `ENTRA_CLIENT_ID` | Yes | Azure Entra app client ID |
| `CALENDLY_API_TOKEN` | Optional | Calendly personal access token |
| `ZOHO_CLIENT_ID/SECRET/REFRESH_TOKEN` | Optional | Zoho CRM OAuth credentials |
| `ACS_CONNECTION_STRING` | Optional | Azure Communication Services |
| `MAX_CALL_ATTEMPTS` | Optional | Failed calls before Uncontactable (default: 3) |

### Frontend (`frontend/.env.example`)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_BASE_URL` | Yes | API base path (e.g. `/api` or full Functions URL) |
| `VITE_ENTRA_CLIENT_ID` | Yes | Azure Entra client ID |
| `VITE_ENTRA_AUTHORITY` | Yes | Entra authority URL |

---

## POPIA Compliance Notes

This system processes special personal information (South African ID numbers)
under the Protection of Personal Information Act (POPIA).

- **ID numbers** are encrypted at rest using AES-256-CBC with a Key Vault-managed key.
  They are never returned in standard API list or get responses.
- **POPIA consent** is captured at event registration and stored per attendee record.
- **Soft deletes** are used throughout — records are excluded from all queries but retained
  for FAIS Act audit requirements. Hard deletion is available via admin functions only.
- **Data residency** is enforced by deploying exclusively to `southafricanorth` (Johannesburg).
- **Subject Access Requests** are handled via admin-only endpoints (not yet scaffolded —
  raise as a task before go-live).

---

## Support

For questions about this scaffold, refer to the Stage 2 Architecture and Design
Specification (`MedBroker-Architecture-Design-Spec-v1.0.docx`).
