#!/usr/bin/env bash
#
# Brings up the local development infrastructure (PostgreSQL + Redis).
#
# Docker Compose is the documented path. Some sandboxes and CI runners have the
# Docker CLI installed but no reachable daemon, so this script transparently
# falls back to the natively installed PostgreSQL and Redis binaries. Either way
# the connection strings in .env.example keep working.
#
# Usage: ./scripts/dev-infra.sh [up|down|status]

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${ROOT_DIR}/.dev-infra"
PG_DATA="${DATA_DIR}/postgres"
PG_LOG="${DATA_DIR}/postgres.log"
REDIS_LOG="${DATA_DIR}/redis.log"
REDIS_PID="${DATA_DIR}/redis.pid"

PG_PORT="${PGPORT:-5432}"
REDIS_PORT="${REDIS_PORT:-6379}"
DB_USER="masalim"
DB_PASSWORD="masalim"
DB_NAME="masalim"

log() { printf '\033[0;36m›\033[0m %s\n' "$*"; }
ok() { printf '\033[0;32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[0;33m!\033[0m %s\n' "$*"; }
die() {
  printf '\033[0;31m✗\033[0m %s\n' "$*" >&2
  exit 1
}

docker_available() {
  command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1
}

find_pg_bin() {
  # Debian/Ubuntu keep the server binaries outside PATH.
  if command -v pg_ctl >/dev/null 2>&1; then
    dirname "$(command -v pg_ctl)"
    return 0
  fi
  # Debian layout is /usr/lib/postgresql/<major>/bin/pg_ctl; take the newest major.
  local candidate
  candidate="$(find /usr/lib/postgresql /usr/pgsql-* -maxdepth 3 -name pg_ctl -type f 2>/dev/null | sort -V | tail -1)"
  [ -n "${candidate}" ] || return 1
  dirname "${candidate}"
}

native_up() {
  mkdir -p "${DATA_DIR}"

  local pg_bin
  pg_bin="$(find_pg_bin)" || die "PostgreSQL server binaries not found. Install postgresql-16 or start Docker."

  if [ ! -d "${PG_DATA}/base" ]; then
    log "Initialising PostgreSQL cluster at ${PG_DATA}"
    rm -rf "${PG_DATA}"
    mkdir -p "${PG_DATA}"
    # initdb refuses to run as root, so run it as the postgres user when we are.
    if [ "$(id -u)" -eq 0 ] && id postgres >/dev/null 2>&1; then
      chown -R postgres:postgres "${DATA_DIR}"
      su postgres -c "${pg_bin}/initdb -D '${PG_DATA}' -U '${DB_USER}' --auth-local=trust --auth-host=trust --encoding=UTF8" >/dev/null
    else
      "${pg_bin}/initdb" -D "${PG_DATA}" -U "${DB_USER}" --auth-local=trust --auth-host=trust --encoding=UTF8 >/dev/null
    fi
  fi

  if pg_isready -h 127.0.0.1 -p "${PG_PORT}" >/dev/null 2>&1; then
    ok "PostgreSQL already running on ${PG_PORT}"
  else
    log "Starting PostgreSQL on port ${PG_PORT}"
    if [ "$(id -u)" -eq 0 ] && id postgres >/dev/null 2>&1; then
      chown -R postgres:postgres "${DATA_DIR}"
      su postgres -c "${pg_bin}/pg_ctl -D '${PG_DATA}' -l '${PG_LOG}' -o '-p ${PG_PORT} -k /tmp' start" >/dev/null
    else
      "${pg_bin}/pg_ctl" -D "${PG_DATA}" -l "${PG_LOG}" -o "-p ${PG_PORT} -k /tmp" start >/dev/null
    fi
    for _ in $(seq 1 30); do
      pg_isready -h 127.0.0.1 -p "${PG_PORT}" >/dev/null 2>&1 && break
      sleep 1
    done
    pg_isready -h 127.0.0.1 -p "${PG_PORT}" >/dev/null 2>&1 || die "PostgreSQL failed to start; see ${PG_LOG}"
    ok "PostgreSQL running"
  fi

  # Create the application database and the shadow database Prisma needs for migrate dev.
  for db in "${DB_NAME}" "${DB_NAME}_shadow" "${DB_NAME}_test"; do
    if ! psql -h 127.0.0.1 -p "${PG_PORT}" -U "${DB_USER}" -lqt postgres 2>/dev/null | cut -d '|' -f1 | grep -qw "${db}"; then
      createdb -h 127.0.0.1 -p "${PG_PORT}" -U "${DB_USER}" "${db}" 2>/dev/null || true
    fi
  done
  psql -h 127.0.0.1 -p "${PG_PORT}" -U "${DB_USER}" -d postgres \
    -c "ALTER USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';" >/dev/null 2>&1 || true
  ok "Databases ready: ${DB_NAME}, ${DB_NAME}_shadow, ${DB_NAME}_test"

  if redis-cli -p "${REDIS_PORT}" ping >/dev/null 2>&1; then
    ok "Redis already running on ${REDIS_PORT}"
  else
    command -v redis-server >/dev/null 2>&1 || die "redis-server not found. Install redis or start Docker."
    log "Starting Redis on port ${REDIS_PORT}"
    redis-server --port "${REDIS_PORT}" --daemonize yes --pidfile "${REDIS_PID}" \
      --logfile "${REDIS_LOG}" --dir "${DATA_DIR}" --appendonly no
    for _ in $(seq 1 20); do
      redis-cli -p "${REDIS_PORT}" ping >/dev/null 2>&1 && break
      sleep 0.5
    done
    redis-cli -p "${REDIS_PORT}" ping >/dev/null 2>&1 || die "Redis failed to start; see ${REDIS_LOG}"
    ok "Redis running"
  fi

  warn "Native mode: object storage uses the local-disk driver (STORAGE_PROVIDER=local)."
}

native_down() {
  local pg_bin
  if pg_bin="$(find_pg_bin)" && [ -d "${PG_DATA}/base" ]; then
    if [ "$(id -u)" -eq 0 ] && id postgres >/dev/null 2>&1; then
      su postgres -c "${pg_bin}/pg_ctl -D '${PG_DATA}' stop -m fast" >/dev/null 2>&1 || true
    else
      "${pg_bin}/pg_ctl" -D "${PG_DATA}" stop -m fast >/dev/null 2>&1 || true
    fi
    ok "PostgreSQL stopped"
  fi
  if redis-cli -p "${REDIS_PORT}" ping >/dev/null 2>&1; then
    redis-cli -p "${REDIS_PORT}" shutdown nosave >/dev/null 2>&1 || true
    ok "Redis stopped"
  fi
}

status() {
  if pg_isready -h 127.0.0.1 -p "${PG_PORT}" >/dev/null 2>&1; then
    ok "PostgreSQL up on ${PG_PORT}"
  else
    warn "PostgreSQL down"
  fi
  if redis-cli -p "${REDIS_PORT}" ping >/dev/null 2>&1; then
    ok "Redis up on ${REDIS_PORT}"
  else
    warn "Redis down"
  fi
}

case "${1:-up}" in
up)
  if docker_available; then
    log "Docker daemon detected — using docker compose"
    docker compose -f "${ROOT_DIR}/docker-compose.yml" up -d
    ok "Infrastructure up (postgres, redis, minio)"
  else
    warn "No Docker daemon — falling back to natively installed PostgreSQL and Redis"
    native_up
  fi
  ;;
down)
  if docker_available; then
    docker compose -f "${ROOT_DIR}/docker-compose.yml" down
    ok "Infrastructure down"
  else
    native_down
  fi
  ;;
status)
  status
  ;;
*)
  die "Usage: $0 [up|down|status]"
  ;;
esac
