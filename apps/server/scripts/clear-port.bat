@echo off
setlocal EnableExtensions

set "PORT=%~1"
if not defined PORT set "PORT=3000"

set "FOUND="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
  if not "%%P"=="0" (
    if not defined KILLED_%%P (
      set "KILLED_%%P=1"
      set "FOUND=1"
      echo Stopping PID %%P on port %PORT%...
      taskkill /PID %%P /F
      if errorlevel 1 exit /b 1
    )
  )
)

if not defined FOUND (
  echo Port %PORT% is already free.
  exit /b 0
)

timeout /t 1 /nobreak >nul

set "REMAINING="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do set "REMAINING=1"

if defined REMAINING (
  echo Port %PORT% is still in use.
  exit /b 1
)

echo Port %PORT% is now free.
exit /b 0
