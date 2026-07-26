@echo off
setlocal EnableExtensions

set "ROOT_DIR=%~dp0"
set "API_PORT=3000"
set "WEB_PORT=8080"
set "USE_DOCKER_DB=0"
set "SKIP_INSTALL=0"
set "SKIP_PRISMA_GENERATE=0"
set "SKIP_MIGRATE=0"
set "SKIP_PUB_GET=0"
set "SEED_ADMIN=0"
set "DATABASE_URL_ARG="
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
if /I "%~1"=="--use-docker-db" (
  set "USE_DOCKER_DB=1"
  shift
  goto parse_args
)
if /I "%~1"=="-UseDockerDb" (
  set "USE_DOCKER_DB=1"
  shift
  goto parse_args
)
if /I "%~1"=="--seed-admin" (
  set "SEED_ADMIN=1"
  shift
  goto parse_args
)
if /I "%~1"=="-SeedAdmin" (
  set "SEED_ADMIN=1"
  shift
  goto parse_args
)
if /I "%~1"=="--skip-install" (
  set "SKIP_INSTALL=1"
  shift
  goto parse_args
)
if /I "%~1"=="-SkipInstall" (
  set "SKIP_INSTALL=1"
  shift
  goto parse_args
)
if /I "%~1"=="--skip-prisma-generate" (
  set "SKIP_PRISMA_GENERATE=1"
  shift
  goto parse_args
)
if /I "%~1"=="-SkipPrismaGenerate" (
  set "SKIP_PRISMA_GENERATE=1"
  shift
  goto parse_args
)
if /I "%~1"=="--skip-migrate" (
  set "SKIP_MIGRATE=1"
  shift
  goto parse_args
)
if /I "%~1"=="-SkipMigrate" (
  set "SKIP_MIGRATE=1"
  shift
  goto parse_args
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
if /I "%~1"=="--api-port" (
  if "%~2"=="" goto missing_value
  set "API_PORT=%~2"
  shift
  shift
  goto parse_args
)
if /I "%~1"=="-ApiPort" (
  if "%~2"=="" goto missing_value
  set "API_PORT=%~2"
  shift
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
if /I "%~1"=="--database-url" (
  if "%~2"=="" goto missing_value
  set "DATABASE_URL_ARG=%~2"
  shift
  shift
  goto parse_args
)
if /I "%~1"=="-DatabaseUrl" (
  if "%~2"=="" goto missing_value
  set "DATABASE_URL_ARG=%~2"
  shift
  shift
  goto parse_args
)

echo Unknown option: %~1
echo.
goto usage

:after_parse
if defined DATABASE_URL_ARG set "DATABASE_URL=%DATABASE_URL_ARG%"

set "SERVER_ARGS=--port %API_PORT%"
if "%USE_DOCKER_DB%"=="1" set "SERVER_ARGS=%SERVER_ARGS% --use-docker-db"
if "%SKIP_INSTALL%"=="1" set "SERVER_ARGS=%SERVER_ARGS% --skip-install"
if "%SKIP_PRISMA_GENERATE%"=="1" set "SERVER_ARGS=%SERVER_ARGS% --skip-prisma-generate"
if "%SKIP_MIGRATE%"=="1" set "SERVER_ARGS=%SERVER_ARGS% --skip-migrate"
if "%SEED_ADMIN%"=="1" set "SERVER_ARGS=%SERVER_ARGS% --seed-admin"

set "CLIENT_ARGS=--web-port %WEB_PORT%"
if "%SKIP_PUB_GET%"=="1" set "CLIENT_ARGS=%CLIENT_ARGS% --skip-pub-get"

echo Starting CloudTodo development services...
echo Server: http://localhost:%API_PORT%
echo Web:    http://localhost:%WEB_PORT%
echo.

start "CloudTodo Server" /D "%ROOT_DIR%" cmd /k call "%ROOT_DIR%start-server.bat" %SERVER_ARGS%
timeout /t 3 /nobreak >nul
start "CloudTodo Web" /D "%ROOT_DIR%" cmd /k call "%ROOT_DIR%start-client-web.bat" %CLIENT_ARGS%

echo Two development terminals were opened. Close those terminals to stop the services.
exit /b 0

:missing_value
echo Missing value for option: %~1
echo.

:usage
echo Usage:
echo   start-dev.bat [options]
echo.
echo Options:
echo   --use-docker-db             Start local PostgreSQL with the development Compose override
echo   --seed-admin                Create a missing local admin; never reset passwords
echo   --skip-install              Skip npm install for the server
echo   --skip-prisma-generate      Skip Prisma client generation
echo   --skip-migrate              Skip database migration deployment
echo   --skip-pub-get              Skip flutter pub get
echo   --api-port 3000             Set backend port
echo   --web-port 8080             Set Flutter Web port
echo   --database-url "url"        Set DATABASE_URL for the server window
exit /b %USAGE_EXIT%
