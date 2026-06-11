param(
  [int]$ApiPort = 3000,
  [int]$WebPort = 8080,
  [string]$DatabaseUrl = "postgresql://cloudtodo:cloudtodo@localhost:5432/cloudtodo?schema=public",
  [switch]$UseDockerDb,
  [switch]$SkipInstall,
  [switch]$SkipPrismaGenerate,
  [switch]$SkipMigrate,
  [switch]$SkipPubGet,
  [switch]$SeedAdmin
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$ServerScript = Join-Path $PSScriptRoot "start-server.ps1"
$ClientScript = Join-Path $PSScriptRoot "start-client-web.ps1"

function Get-PowerShellExe {
  $pwsh = Get-Command pwsh -ErrorAction SilentlyContinue
  if ($pwsh) {
    return $pwsh.Source
  }

  $powershell = Get-Command powershell -ErrorAction SilentlyContinue
  if ($powershell) {
    return $powershell.Source
  }

  throw "PowerShell executable was not found."
}

$PowerShellExe = Get-PowerShellExe

$serverArgs = @(
  "-NoExit",
  "-ExecutionPolicy",
  "Bypass",
  "-File",
  $ServerScript,
  "-Port",
  "$ApiPort",
  "-DatabaseUrl",
  $DatabaseUrl
)

if ($UseDockerDb) { $serverArgs += "-UseDockerDb" }
if ($SkipInstall) { $serverArgs += "-SkipInstall" }
if ($SkipPrismaGenerate) { $serverArgs += "-SkipPrismaGenerate" }
if ($SkipMigrate) { $serverArgs += "-SkipMigrate" }
if ($SeedAdmin) { $serverArgs += "-SeedAdmin" }

$clientArgs = @(
  "-NoExit",
  "-ExecutionPolicy",
  "Bypass",
  "-File",
  $ClientScript,
  "-WebPort",
  "$WebPort"
)

if ($SkipPubGet) { $clientArgs += "-SkipPubGet" }

Write-Host "Starting CloudTodo development services..." -ForegroundColor Cyan
Write-Host "Server: http://localhost:$ApiPort"
Write-Host "Web:    http://localhost:$WebPort"
Write-Host ""

Start-Process -FilePath $PowerShellExe -ArgumentList $serverArgs -WorkingDirectory $RootDir -WindowStyle Normal
Start-Sleep -Seconds 3
Start-Process -FilePath $PowerShellExe -ArgumentList $clientArgs -WorkingDirectory $RootDir -WindowStyle Normal

Write-Host "Two development terminals were opened. Close those terminals to stop the services." -ForegroundColor Green
