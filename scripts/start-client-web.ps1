param(
  [int]$WebPort = 8080,
  [string]$WebHostname = "localhost",
  [switch]$SkipPubGet
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$ClientDir = Join-Path $RootDir "apps/client_flutter"

function Invoke-Step {
  param(
    [string]$Title,
    [scriptblock]$Action
  )

  Write-Host ""
  Write-Host "==> $Title" -ForegroundColor Cyan
  & $Action
}

Push-Location $ClientDir
try {
  if (-not $SkipPubGet) {
    Invoke-Step "Resolving Flutter dependencies" {
      flutter pub get
    }
  }

  Invoke-Step "Starting CloudTodo Web on http://${WebHostname}:$WebPort" {
    flutter run -d chrome --web-hostname $WebHostname --web-port $WebPort
  }
} finally {
  Pop-Location
}
