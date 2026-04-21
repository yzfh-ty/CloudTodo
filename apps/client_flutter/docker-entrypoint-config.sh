#!/bin/sh
set -eu

cat >/usr/share/nginx/html/config.json <<EOF
{
  "appName": "${APP_NAME:-CloudTodo Web}",
  "appEnv": "${APP_ENV:-production}",
  "apiBaseUrl": "${API_BASE_URL:-http://localhost:3000/api}"
}
EOF
