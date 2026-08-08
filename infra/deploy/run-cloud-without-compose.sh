#!/bin/bash
# CentOS7 云主机：无 docker compose 插件时用这套命令构建并启动
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="$ROOT_DIR/infra/deploy/cloud.env"
if [ ! -f "$ENV_FILE" ]; then
  cp "$ROOT_DIR/infra/deploy/cloud.env.example" "$ENV_FILE"
  echo "已创建 $ENV_FILE ，请先编辑 CORS_ORIGIN 后再重新执行"
  exit 1
fi

mkdir -p data/cloud/db data/cloud/storage data/cloud/logs

if [ ! -f data/cloud/db/dev.db ]; then
  echo "缺少 data/cloud/db/dev.db，请先上传数据库文件"
  exit 1
fi

echo "[1/4] build api image (prebuilt dist, no tsc on server)..."
docker build -f Dockerfile.api.prebuilt -t ai-novel-cloud-api .

echo "[2/4] build web image (static dist)..."
docker build -f Dockerfile.web.prebuilt -t ai-novel-cloud-web .

echo "[3/4] recreate network/containers..."
docker rm -f ai-novel-api ai-novel-web >/dev/null 2>&1 || true
docker network rm ai-novel-net >/dev/null 2>&1 || true
docker network create ai-novel-net >/dev/null

# 读取 cloud.env 为 --env-file
docker run -d \
  --name ai-novel-api \
  --network ai-novel-net \
  --network-alias api \
  --restart unless-stopped \
  --memory 2500m \
  --env-file "$ENV_FILE" \
  -e HOST=0.0.0.0 \
  -e PORT=3000 \
  -e AI_NOVEL_DATABASE_MODE=sqlite \
  -e DATABASE_URL=file:/app/server/data/dev.db \
  -e SQLITE_DATABASE_PATH=/app/server/data/dev.db \
  -v "$ROOT_DIR/data/cloud/db:/app/server/data" \
  -v "$ROOT_DIR/data/cloud/storage:/app/server/storage" \
  -v "$ROOT_DIR/data/cloud/logs:/app/.logs" \
  ai-novel-cloud-api

docker run -d \
  --name ai-novel-web \
  --network ai-novel-net \
  --restart unless-stopped \
  --memory 256m \
  -p 80:8080 \
  ai-novel-cloud-web

echo "[4/4] status"
docker ps --filter name=ai-novel-
echo "health: $(curl -sS -m 5 http://127.0.0.1/api/health || echo failed)"
