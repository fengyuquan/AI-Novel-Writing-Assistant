#!/bin/sh
set -eu

cd /app

DB_PATH="${SQLITE_DATABASE_PATH:-/app/server/data/dev.db}"
# 挂载目录可能由宿主机 root 创建；尽量创建子目录，失败不阻断启动
mkdir -p "$(dirname "$DB_PATH")" /app/.logs 2>/dev/null || true
mkdir -p /app/server/storage/generated-images 2>/dev/null || true

if [ ! -f "$DB_PATH" ]; then
  echo "[entrypoint] no sqlite database at ${DB_PATH}; prisma will create an empty one"
fi

if [ "${PRISMA_PUSH_ON_START:-true}" = "true" ]; then
  echo "[entrypoint] syncing sqlite schema..."
  if [ "${PRISMA_ACCEPT_DATA_LOSS:-false}" = "true" ]; then
    /app/node_modules/.bin/prisma db push \
      --schema /app/server/src/prisma/schema.sqlite.prisma \
      --accept-data-loss
  else
    /app/node_modules/.bin/prisma db push \
      --schema /app/server/src/prisma/schema.sqlite.prisma
  fi
fi

echo "[entrypoint] starting api"
exec node /app/server/dist/app.js