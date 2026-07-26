#!/bin/sh
set -eu

if [ "${APP_ENV:-local}" = "production" ] || [ "${APP_ENV:-local}" = "release" ]; then
  case "${API_BASE_URL:-}" in
    https://*|/api|/api/) ;;
    *) echo "API_BASE_URL must be an HTTPS URL or same-origin /api path in production" >&2; exit 1 ;;
  esac
fi

api_base_url=${API_BASE_URL:-}
app_name=${APP_NAME:-CloudTodo Web}
app_env=${APP_ENV:-local}
escape_json() {
  printf '%s' "$1" | sed 's/[\\\"]/[\\&]/g'
}

cat > /tmp/cloudtodo-config.json <<EOF
{
  "appName": "$(escape_json "$app_name")",
  "appEnv": "$(escape_json "$app_env")",
  "apiBaseUrl": "$(escape_json "$api_base_url")"
}
EOF
