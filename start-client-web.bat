@echo off
setlocal EnableExtensions

set "ROOT_DIR=%~dp0"
set "CLIENT_DIR=%ROOT_DIR%apps\client_flutter"
set "WEB_PORT=8080"
set "WEB_HOSTNAME=localhost"
set "SKIP_PUB_GET=0"
set "USAGE_EXIT=1"

:parse_args
if "%~1"=="" goto after_parse
if /I "%~1"=="--help" (
  set "USAGE_EXIT=0"
  goto usage
)
if /I "%~1"=="-h" (
  set "USAGE_EXIT=0"
  goto usage
)
if /I "%~1"=="--skip-pub-get" (
  set "SKIP_PUB_GET=1"
  shift
  goto parse_args
)
if /I "%~1"=="-SkipPubGet" (
  set "SKIP_PUB_GET=1"
  shift
  goto parse_args
)
if /I "%~1"=="--web-port" (
  if "%~2"=="" goto missing_value
  set "WEB_PORT=%~2"
  shift
  shift
  goto parse_args
)
if /I "%~1"=="-WebPort" (
  if "%~2"=="" goto missing_value
  set "WEB_PORT=%~2"
  shift
  shift
  goto parse_args
)
if /I "%~1"=="--web-hostname" (
  if "%~2"=="" goto missing_value
  set "WEB_HOSTNAME=%~2"
  shift
  shift
  goto parse_args
)
if /I "%~1"=="-WebHostname" (
  if "%~2"=="" goto missing_value
  set "WEB_HOSTNAME=%~2"
  shift
  shift
  goto parse_args
)

echo Unknown option: %~1
echo.
goto usage

:after_parse
pushd "%CLIENT_DIR%" || exit /b 1

if "%SKIP_PUB_GET%"=="0" (
  echo.
  echo ==^> Resolving Flutter dependencies
  call flutter pub get
  if errorlevel 1 goto fail
)

echo.
echo ==^> Starting CloudTodo Web on http://%WEB_HOSTNAME%:%WEB_PORT%
call flutter run -d chrome --web-hostname %WEB_HOSTNAME% --web-port %WEB_PORT%
set "EXIT_CODE=%ERRORLEVEL%"
popd
exit /b %EXIT_CODE%

:fail
set "EXIT_CODE=%ERRORLEVEL%"
popd
exit /b %EXIT_CODE%

:missing_value
echo Missing value for option: %~1
echo.

:usage
echo Usage:
echo   start-client-web.bat [options]
echo.
echo Options:
echo   --skip-pub-get              Skip flutter pub get
echo   --web-port 8080             Set Flutter Web port
echo   --web-hostname localhost    Set Flutter Web hostname
exit /b %USAGE_EXIT%
