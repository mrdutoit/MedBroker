// infra/main.bicep
// MedBroker — Azure infrastructure as code
// Deploys all resources to South Africa North (Johannesburg) by default.
// Run with: az deployment group create --resource-group medbroker-rg --template-file main.bicep --parameters @parameters/prod.json

@description('Environment name — used as a suffix on resource names. E.g. dev, test, prod')
param environment string = 'prod'

@description('Azure region for all resources. Default: South Africa North for POPIA data residency.')
param location string = 'southafricanorth'

@description('A short unique suffix (3-6 chars) to make globally unique resource names.')
param uniqueSuffix string

@description('SQL administrator password. Supply at deploy time (e.g. from Key Vault or a secure pipeline variable); never commit a value. Managed Identity is used for app access — this admin login is for break-glass/DDL only.')
@secure()
param sqlAdminPassword string

// ─── Derived names (no hyphens in storage/keyvault names) ───────────────────
var appName         = 'medbroker'
var rgPrefix        = '${appName}-${environment}'
var storageAccName  = '${appName}${environment}${uniqueSuffix}'     // e.g. medbrokerprod4f2a
var kvName          = '${appName}-kv-${environment}-${uniqueSuffix}'
var sqlServerName   = '${appName}-sql-${environment}'
var sqlDbName       = '${appName}'
var funcAppName     = '${appName}-api-${environment}'
var swaName         = '${appName}-web-${environment}'

// ─── Storage Account (required by Function App) ─────────────────────────────
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccName
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    supportsHttpsTrafficOnly: true
  }
}

// ─── Key Vault ───────────────────────────────────────────────────────────────
// Stores the field-level encryption key for Lead.id_number (POPIA requirement)
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: kvName
  location: location
  properties: {
    sku: { family: 'A', name: 'standard' }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true  // Use RBAC roles, not vault access policies
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true    // Prevents accidental key deletion
    publicNetworkAccess: 'Enabled' // Restrict to VNet in a future hardening step
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

// ─── Azure SQL Server ────────────────────────────────────────────────────────
resource sqlServer 'Microsoft.Sql/servers@2023-05-01-preview' = {
  name: sqlServerName
  location: location
  properties: {
    // note: Managed Identity is used for app authentication — no admin password in code.
    // Set the admin login manually in the Portal or via az sql server update after deployment.
    administratorLogin: 'medbroker_admin'
    administratorLoginPassword: sqlAdminPassword
    minimalTlsVersion: '1.2'
  }

  // Allow Azure services to connect (required for Functions and Static Web Apps)
  resource firewallRule 'firewallRules' = {
    name: 'AllowAzureServices'
    properties: {
      startIpAddress: '0.0.0.0'
      endIpAddress: '0.0.0.0'
    }
  }
}

// ─── Azure SQL Database (Serverless, General Purpose) ────────────────────────
resource sqlDatabase 'Microsoft.Sql/servers/databases@2023-05-01-preview' = {
  parent: sqlServer
  name: sqlDbName
  location: location
  sku: {
    name: 'GP_S_Gen5_1'   // Serverless General Purpose — auto-pauses when idle
    tier: 'GeneralPurpose'
    family: 'Gen5'
    capacity: 1
  }
  properties: {
    autoPauseDelay: -1     // -1 = disabled (do not auto-pause in production to avoid cold starts)
    minCapacity: '0.5'     // Minimum vCores when running
    requestedBackupStorageRedundancy: 'Local'
    collation: 'SQL_Latin1_General_CP1_CI_AS'
  }
}

// ─── App Service Plan (Consumption — Functions) ───────────────────────────────
resource functionAppPlan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: '${rgPrefix}-plan'
  location: location
  kind: 'functionapp'
  sku: { name: 'Y1', tier: 'Dynamic' }  // Consumption plan — pay per execution
  properties: { reserved: true }         // Linux
}

// ─── Azure Functions App ──────────────────────────────────────────────────────
resource functionApp 'Microsoft.Web/sites@2023-01-01' = {
  name: funcAppName
  location: location
  kind: 'functionapp,linux'
  identity: { type: 'SystemAssigned' }  // Managed Identity for Key Vault + SQL access
  properties: {
    serverFarmId: functionAppPlan.id
    siteConfig: {
      linuxFxVersion: 'NODE|20'
      functionAppScaleLimit: 200
      appSettings: [
        { name: 'AzureWebJobsStorage',          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccName};AccountKey=${storageAccount.listKeys().keys[0].value}' }
        { name: 'FUNCTIONS_EXTENSION_VERSION',   value: '~4' }
        { name: 'FUNCTIONS_WORKER_RUNTIME',      value: 'node' }
        { name: 'WEBSITE_RUN_FROM_PACKAGE',      value: '1' }
        { name: 'NODE_ENV',                      value: environment == 'prod' ? 'production' : 'development' }
        { name: 'KEY_VAULT_URL',                 value: keyVault.properties.vaultUri }
        { name: 'DB_SERVER',                     value: '${sqlServerName}.database.windows.net' }
        { name: 'DB_NAME',                       value: sqlDbName }
        { name: 'DB_USE_PASSWORD',               value: 'false' }  // Use Managed Identity
        // note: Add ENTRA_TENANT_ID, ENTRA_CLIENT_ID, CALENDLY_API_TOKEN etc. manually in Portal
        // or via Key Vault references: @Microsoft.KeyVault(SecretUri=...)
      ]
      cors: {
        allowedOrigins: environment == 'prod'
          ? ['https://${swaName}.azurestaticapps.net']
          : ['https://${swaName}.azurestaticapps.net', 'http://localhost:5173']
        supportCredentials: true
      }
    }
    httpsOnly: true
  }
}

// Grant the Function App's Managed Identity access to Key Vault secrets
resource kvRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, functionApp.id, 'Key Vault Secrets User')
  scope: keyVault
  properties: {
    // Key Vault Secrets User = read secrets only (not manage keys)
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Grant the Function App's Managed Identity access to Key Vault keys (for encryption wrap/unwrap)
resource kvKeyUserRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, functionApp.id, 'Key Vault Crypto User')
  scope: keyVault
  properties: {
    // Key Vault Crypto User = use keys for encrypt/decrypt/wrap/unwrap
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '12338af0-0e69-4776-bea7-57ae8d297424')
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// ─── Azure Static Web Apps ────────────────────────────────────────────────────
resource staticWebApp 'Microsoft.Web/staticSites@2023-01-01' = {
  name: swaName
  location: location
  sku: { name: 'Free', tier: 'Free' }
  properties: {
    buildProperties: {
      appLocation: '/frontend'
      outputLocation: 'dist'
    }
  }
}

// ─── Outputs ─────────────────────────────────────────────────────────────────
output functionAppUrl        string = 'https://${functionApp.properties.defaultHostName}'
output staticWebAppUrl       string = 'https://${staticWebApp.properties.defaultHostname}'
output keyVaultUri           string = keyVault.properties.vaultUri
output sqlServerFqdn         string = sqlServer.properties.fullyQualifiedDomainName
output functionAppPrincipalId string = functionApp.identity.principalId
