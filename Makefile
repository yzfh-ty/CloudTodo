.DEFAULT_GOAL := help

SHELL := /bin/sh
SERVER_DIR := apps/server
CLIENT_DIR := apps/client_flutter
SERVER_COMPOSE_FILES := -f $(SERVER_DIR)/docker-compose.yml -f $(SERVER_DIR)/docker-compose.development.yml

.PHONY: help setup local-env server-install server-generate db-up db-migrate seed-admin provision-admin db-down server-dev client-get client-dev server-test client-test test server-lint client-lint lint server-build client-build client-build-android client-build-linux build check

help:
	@printf '%s\n' \
		'CloudTodo development commands:' \
		'  make setup          Install dependencies and prepare local configuration' \
		'  make db-up          Start the local PostgreSQL container' \
		'  make seed-admin     Create the local admin account if it is missing' \
		'  make provision-admin Create a one-time admin from ADMIN_INITIAL_* variables' \
		'  make db-down        Stop the local PostgreSQL container' \
		'  make server-dev     Start the NestJS development server' \
		'  make client-dev     Start Flutter Web in Chrome' \
		'  make client-build-android  Build an ARM32 + ARM64 + x86_64 debug APK' \
		'  make client-build-linux    Build Linux release (requires CLOUDTODO_API_BASE_URL=https://...)' \
		'  make test           Run server tests and Flutter tests' \
		'  make lint           Run TypeScript and Flutter static checks' \
		'  make build          Build the server, Flutter Web, and Linux release' \
		'  make check          Run lint, tests, and builds'

setup: local-env server-install server-generate client-get
	@printf '%s\n' 'Local setup complete. Review apps/server/.env before starting the server.'

local-env:
	@test -f $(SERVER_DIR)/.env || cp $(SERVER_DIR)/.env.development.example $(SERVER_DIR)/.env

server-install:
	npm ci --prefix $(SERVER_DIR)

server-generate:
	npm run prisma:generate --prefix $(SERVER_DIR)

db-up: local-env
	docker compose $(SERVER_COMPOSE_FILES) up -d --wait postgres

db-migrate: local-env db-up server-generate
	npm run prisma:migrate:deploy --prefix $(SERVER_DIR)

seed-admin: db-migrate
	npm run seed:admin --prefix $(SERVER_DIR)

provision-admin: db-migrate
	npm run provision:admin --prefix $(SERVER_DIR)

db-down: local-env
	docker compose $(SERVER_COMPOSE_FILES) down

server-dev:
	npm run start:dev --prefix $(SERVER_DIR)

client-get:
	cd $(CLIENT_DIR) && flutter pub get

client-dev:
	cd $(CLIENT_DIR) && flutter run -d chrome --web-hostname localhost --web-port 8080 --no-web-resources-cdn

server-test:
	npm test --prefix $(SERVER_DIR)

client-test:
	cd $(CLIENT_DIR) && flutter test

test: server-test client-test

server-lint:
	npm run lint --prefix $(SERVER_DIR)

client-lint:
	cd $(CLIENT_DIR) && flutter analyze

lint: server-lint client-lint

server-build:
	npm run build --prefix $(SERVER_DIR)

client-build:
	cd $(CLIENT_DIR) && flutter build web --release

client-build-android:
	cd $(CLIENT_DIR) && flutter build apk --debug --target-platform android-arm,android-arm64,android-x64

client-build-linux:
	@case "$(CLOUDTODO_API_BASE_URL)" in https://*) ;; *) printf '%s\n' 'CLOUDTODO_API_BASE_URL must be an explicit HTTPS URL for native release builds' >&2; exit 1 ;; esac
	cd $(CLIENT_DIR) && flutter build linux --release --dart-define=CLOUDTODO_API_BASE_URL="$(CLOUDTODO_API_BASE_URL)"

build: server-build client-build client-build-linux

check: lint test build
