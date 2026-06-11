param(
  [int]$Port = 3000,
  [string]$DatabaseUrl = "postgresql://cloudtodo:cloudtodo@localhost:5432/cloudtodo?schema=public",
  [switch]$UseDockerDb,
  [switch]$SkipInstall,
  [switch]$SkipPrismaGenerate,
  [switch]$SkipMigrate,
  [switch]$SeedAdmin
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$ServerDir = Join-Path $RootDir "apps/server"

function Invoke-Step {
  param(
    [string]$Title,
    [scriptblock]$Action
  )

  Write-Host ""
  Write-Host "==> $Title" -ForegroundColor Cyan
  & $Action
}

$env:NODE_ENV = if ($env:NODE_ENV) { $env:NODE_ENV } else { "development" }
$env:PORT = "$Port"
$env:APP_NAME = if ($env:APP_NAME) { $env:APP_NAME } else { "CloudTodo Server" }
$env:APP_BASE_URL = if ($env:APP_BASE_URL) { $env:APP_BASE_URL } else { "http://localhost:$Port" }
$env:DATABASE_URL = if ($env:DATABASE_URL) { $env:DATABASE_URL } else { $DatabaseUrl }
$env:JWT_ACCESS_SECRET = if ($env:JWT_ACCESS_SECRET) { $env:JWT_ACCESS_SECRET } else { "local-access-secret" }
$env:JWT_REFRESH_SECRET = if ($env:JWT_REFRESH_SECRET) { $env:JWT_REFRESH_SECRET } else { "local-refresh-secret" }
$env:WEBHOOK_SIGNING_SECRET = if ($env:WEBHOOK_SIGNING_SECRET) { $env:WEBHOOK_SIGNING_SECRET } else { "local-webhook-secret" }
$env:ADMIN_SESSION_SECRET = if ($env:ADMIN_SESSION_SECRET) { $env:ADMIN_SESSION_SECRET } else { "local-admin-session-secret" }
$env:SCHEDULER_ENABLED = if ($env:SCHEDULER_ENABLED) { $env:SCHEDULER_ENABLED } else { "true" }

if ($UseDockerDb) {
  Invoke-Step "Starting PostgreSQL with Docker Compose" {
    Push-Location $ServerDir
    try {
      docker compose up -d postgres
    } finally {
      Pop-Location
    }
  }
}

Push-Location $ServerDir
try {
  if (-not $SkipInstall -and -not (Test-Path "node_modules")) {
    Invoke-Step "Installing server dependencies" {
      npm install
    }
  }

  if (-not $SkipPrismaGenerate) {
    Invoke-Step "Generating Prisma client" {
      npm run prisma:generate
    }
  }

  if (-not $SkipMigrate) {
    Invoke-Step "Applying database migrations" {
      npm run prisma:migrate:deploy
    }
  }

  if ($SeedAdmin) {
    Invoke-Step "Seeding admin user" {
      npm run seed:admin
    }
  }

  Invoke-Step "Starting CloudTodo server on http://localhost:$Port" {
    npm run start:dev
  }
} finally {
  Pop-Location
}
