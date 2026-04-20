param(
  [int]$Port = 3000
)

$connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue

if (-not $connections) {
  Write-Output "Port $Port is already free."
  exit 0
}

$pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique

foreach ($owningPid in $pids) {
  $process = Get-Process -Id $owningPid -ErrorAction SilentlyContinue

  if (-not $process) {
    Write-Output "Process $owningPid no longer exists."
    continue
  }

  Write-Output "Stopping PID $owningPid ($($process.ProcessName)) on port $Port..."
  Stop-Process -Id $owningPid -Force
}

Start-Sleep -Milliseconds 500

$remaining = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($remaining) {
  Write-Error "Port $Port is still in use."
  exit 1
}

Write-Output "Port $Port is now free."
