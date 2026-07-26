@echo off
setlocal EnableExtensions

set "ROOT_DIR=%~dp0"
set "SERVER_DIR=%ROOT_DIR%apps\server"
set "API_PORT=3000"
set "DATABASE_URL_ARG="
set "USE_DOCKER_DB=0"
set "SKIP_INSTALL=0"
set "SKIP_PRISMA_GENERATE=0"
set "SKIP_MIGRATE=0"
set "SEED_ADMIN=0"
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
if /I "%~1"=="--port" (
  if "%~2"=="" goto missing_value
  set "API_PORT=%~2"
  shift
  shift
  goto parse_args
)
if /I "%~1"=="-Port" (
  if "%~2"=="" goto missing_value
  set "API_PORT=%~2"
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
set "PORT=%API_PORT%"
if not exist "%SERVER_DIR%\.env" (
  if not defined NODE_ENV set "NODE_ENV=development"
  if not defined APP_NAME set "APP_NAME=CloudTodo Server"
  if not defined APP_BASE_URL set "APP_BASE_URL=http://localhost:%API_PORT%"
  if /I not "%NODE_ENV%"=="production" (
    if not defined POSTGRES_USER set "POSTGRES_USER=cloudtodo"
    if not defined POSTGRES_PASSWORD set "POSTGRES_PASSWORD=cloudtodo"
    if not defined POSTGRES_DB set "POSTGRES_DB=cloudtodo"
    if not defined POSTGRES_BIND_ADDRESS set "POSTGRES_BIND_ADDRESS=127.0.0.1"
    if not defined POSTGRES_PORT set "POSTGRES_PORT=5432"
    if not defined JWT_ACCESS_SECRET set "JWT_ACCESS_SECRET=local-access-secret"
    if not defined JWT_REFRESH_SECRET set "JWT_REFRESH_SECRET=local-refresh-secret"
    if not defined WEBHOOK_SIGNING_SECRET set "WEBHOOK_SIGNING_SECRET=local-webhook-secret"
    if not defined ADMIN_SESSION_SECRET set "ADMIN_SESSION_SECRET=local-admin-session-secret"
    if not defined CSRF_SECRET set "CSRF_SECRET=local-csrf-secret"
    if not defined WEBHOOK_SECRET_ENCRYPTION_KEY set "WEBHOOK_SECRET_ENCRYPTION_KEY=local-webhook-secret-encryption-key"
    if not defined PASSWORD_RESET_TOKEN_SECRET set "PASSWORD_RESET_TOKEN_SECRET=local-password-reset-token-secret"
    if not defined SCHEDULER_ENABLED set "SCHEDULER_ENABLED=true"
  )
)
if not exist "%SERVER_DIR%\.env" if /I not "%NODE_ENV%"=="production" if not defined DATABASE_URL set "DATABASE_URL=postgresql://%POSTGRES_USER%:%POSTGRES_PASSWORD%@localhost:%POSTGRES_PORT%/%POSTGRES_DB%?schema=public"
if defined DATABASE_URL_ARG set "DATABASE_URL=%DATABASE_URL_ARG%"

if "%USE_DOCKER_DB%"=="1" (
  echo.
  echo ==^> Starting PostgreSQL with Docker Compose
  pushd "%SERVER_DIR%" || exit /b 1
  docker compose -f docker-compose.yml -f docker-compose.development.yml up -d --wait postgres
  if errorlevel 1 (
    popd
    exit /b 1
  )
  popd
)

pushd "%SERVER_DIR%" || exit /b 1

if "%SKIP_INSTALL%"=="0" (
  if not exist "node_modules" (
    echo.
    echo ==^> Installing server dependencies from package-lock.json
    call npm ci
    if errorlevel 1 goto fail
  )
)

if "%SKIP_PRISMA_GENERATE%"=="0" (
  echo.
  echo ==^> Generating Prisma client
  call npm run prisma:generate
  if errorlevel 1 goto fail
)

if "%SKIP_MIGRATE%"=="0" (
  echo.
  echo ==^> Applying database migrations
  call npm run prisma:migrate:deploy
  if errorlevel 1 goto fail
)

if "%SEED_ADMIN%"=="1" (
  echo.
  echo ==^> Creating the local admin user if missing
  call npm run seed:admin
  if errorlevel 1 goto fail
)

echo.
echo ==^> Starting CloudTodo server on http://localhost:%API_PORT%
call npm run start:dev
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
echo   start-server.bat [options]
echo.
echo Options:
echo   --use-docker-db             Start local PostgreSQL with the development Compose override
echo   --seed-admin                Create a missing local admin; never reset passwords
echo   --skip-install              Skip npm ci
echo   --skip-prisma-generate      Skip Prisma client generation
echo   --skip-migrate              Skip database migration deployment
echo   --port 3000                 Set backend port
echo   --database-url "url"        Set DATABASE_URL
exit /b %USAGE_EXIT%
