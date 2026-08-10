#!/usr/bin/env bash
# 云主机：解包增量更新、备份数据库、按需重建 Docker 镜像并重启
# 用法：
#   bash infra/deploy/cloud-update.remote.sh --package data/cloud/incoming/ai-novel-cloud-update-XXXX.tgz
#   bash infra/deploy/cloud-update.remote.sh --package ... --no-cache
#   bash infra/deploy/cloud-update.remote.sh --git-pull --shared --server

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

PACKAGE=""
NO_CACHE=0
GIT_PULL=0
FORCE_SHARED=0
FORCE_SERVER=0
FORCE_CLIENT=0
SKIP_BACKUP=0
WEB_PORT="${AI_NOVEL_CLOUD_WEB_PORT:-5173}"
ENV_FILE="$ROOT_DIR/infra/deploy/cloud.env"

usage() {
  cat <<'EOF'
用法:
  bash infra/deploy/cloud-update.remote.sh --package <相对/绝对路径.tgz> [--no-cache]
  bash infra/deploy/cloud-update.remote.sh --git-pull [--shared] [--server] [--client] [--no-cache]

说明:
  --package     本机上传的增量包
  --git-pull    先 git pull，再按参数重建（适合源码已在云上同步时）
  --no-cache    docker build --no-cache
  --skip-backup 跳过 SQLite 备份（不推荐）
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --package)
      PACKAGE="${2:-}"
      shift 2
      ;;
    --no-cache)
      NO_CACHE=1
      shift
      ;;
    --git-pull)
      GIT_PULL=1
      shift
      ;;
    --shared)
      FORCE_SHARED=1
      shift
      ;;
    --server)
      FORCE_SERVER=1
      shift
      ;;
    --client)
      FORCE_CLIENT=1
      shift
      ;;
    --skip-backup)
      SKIP_BACKUP=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "未知参数: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ ! -f "$ENV_FILE" ]]; then
  echo "缺少 $ENV_FILE ，请先从 cloud.env.example 复制并填写 CORS_ORIGIN" >&2
  exit 1
fi

mkdir -p data/cloud/db data/cloud/db/backups data/cloud/storage data/cloud/logs data/cloud/incoming data/cloud/auth

NEED_API=0
NEED_WEB=0

apply_manifest() {
  local manifest="$1"
  if [[ ! -f "$manifest" ]]; then
    echo "警告：包内没有 cloud-update.manifest.json，将按目录或默认重建"
    [[ -d shared/dist || -d server/dist ]] && NEED_API=1
    [[ -d client/dist ]] && NEED_WEB=1
    return 0
  fi
  if command -v python3 >/dev/null 2>&1; then
    NEED_API="$(python3 -c 'import json,sys; m=json.load(open(sys.argv[1],encoding="utf-8")); print(1 if (m.get("needApi") or m.get("shared") or m.get("server")) else 0)' "$manifest")"
    NEED_WEB="$(python3 -c 'import json,sys; m=json.load(open(sys.argv[1],encoding="utf-8")); print(1 if (m.get("needWeb") or m.get("client")) else 0)' "$manifest")"
    if [[ "$(python3 -c 'import json,sys; m=json.load(open(sys.argv[1],encoding="utf-8")); print(1 if m.get("noCache") else 0)' "$manifest")" -eq 1 ]]; then
      NO_CACHE=1
    fi
  else
    [[ -d shared/dist || -d server/dist ]] && NEED_API=1
    [[ -d client/dist ]] && NEED_WEB=1
  fi
}

if [[ "$GIT_PULL" -eq 1 ]]; then
  echo "==> git pull"
  git pull --ff-only
fi

if [[ -n "$PACKAGE" ]]; then
  if [[ "$PACKAGE" != /* ]]; then
    PACKAGE="$ROOT_DIR/$PACKAGE"
  fi
  if [[ ! -f "$PACKAGE" ]]; then
    echo "找不到更新包: $PACKAGE" >&2
    exit 1
  fi
  echo "==> 解包 $PACKAGE"
  tar -xzf "$PACKAGE" -C "$ROOT_DIR"
  apply_manifest "$ROOT_DIR/cloud-update.manifest.json"
  rm -f "$ROOT_DIR/cloud-update.manifest.json"
  chmod +x "$ROOT_DIR/infra/deploy/cloud-update.remote.sh" || true
  chmod +x "$ROOT_DIR/infra/deploy/api-entrypoint-sqlite.sh" || true
fi

if [[ "$FORCE_SHARED" -eq 1 || "$FORCE_SERVER" -eq 1 ]]; then
  NEED_API=1
fi
if [[ "$FORCE_CLIENT" -eq 1 ]]; then
  NEED_WEB=1
fi

# 都没指定时：若刚解了包但解析失败，默认重建 api
if [[ "$NEED_API" -eq 0 && "$NEED_WEB" -eq 0 ]]; then
  if [[ -n "$PACKAGE" ]]; then
    NEED_API=1
  else
    echo "未指定更新范围。请传 --package，或 --shared/--server/--client。" >&2
    exit 1
  fi
fi

if [[ "$SKIP_BACKUP" -eq 0 && -f data/cloud/db/dev.db ]]; then
  bak="data/cloud/db/backups/dev.db.bak.$(date +%Y%m%d%H%M%S)"
  echo "==> 备份数据库 -> $bak"
  cp -a data/cloud/db/dev.db "$bak"
fi

docker network create ai-novel-net >/dev/null 2>&1 || true

build_image() {
  local dockerfile="$1"
  local tag="$2"
  if [[ "$NO_CACHE" -eq 1 ]]; then
    docker build --no-cache -f "$dockerfile" -t "$tag" .
  else
    docker build -f "$dockerfile" -t "$tag" .
  fi
}

if [[ "$NEED_API" -eq 1 ]]; then
  if [[ ! -d shared/dist || ! -d server/dist ]]; then
    echo "重建 API 需要 shared/dist 与 server/dist" >&2
    exit 1
  fi
  echo "==> docker build api"
  build_image Dockerfile.api.prebuilt ai-novel-cloud-api
fi

if [[ "$NEED_WEB" -eq 1 ]]; then
  if [[ ! -d client/dist ]]; then
    echo "重建 Web 需要 client/dist" >&2
    exit 1
  fi
  echo "==> docker build web"
  build_image Dockerfile.web.prebuilt ai-novel-cloud-web
fi

if [[ "$NEED_API" -eq 1 ]]; then
  echo "==> 重启 ai-novel-api"
  docker rm -f ai-novel-api >/dev/null 2>&1 || true
  docker run -d \
    --name ai-novel-api \
    --network ai-novel-net \
    --network-alias api \
    --restart unless-stopped \
    --memory 2500m \
    --add-host=host.docker.internal:host-gateway \
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
fi

if [[ "$NEED_WEB" -eq 1 ]]; then
  echo "==> 重启 ai-novel-web (port $WEB_PORT)"
  docker rm -f ai-novel-web >/dev/null 2>&1 || true
  if [[ -f data/cloud/auth/.htpasswd ]]; then
    docker run -d \
      --name ai-novel-web \
      --network ai-novel-net \
      --restart unless-stopped \
      --memory 256m \
      -p "${WEB_PORT}:8080" \
      -v "$ROOT_DIR/data/cloud/auth/.htpasswd:/etc/nginx/auth/.htpasswd:ro" \
      ai-novel-cloud-web
  else
    docker run -d \
      --name ai-novel-web \
      --network ai-novel-net \
      --restart unless-stopped \
      --memory 256m \
      -p "${WEB_PORT}:8080" \
      ai-novel-cloud-web
  fi
fi

echo "==> 容器状态"
docker ps --filter name=ai-novel-

echo "==> 健康检查"
if curl -fsS -m 8 "http://127.0.0.1:${WEB_PORT}/api/health" >/tmp/ai-novel-health.json 2>/dev/null; then
  cat /tmp/ai-novel-health.json
  echo
else
  echo "警告：健康检查未通过。可查看：docker logs ai-novel-api --tail 100"
fi

if [[ "$NEED_API" -eq 1 ]]; then
  echo "==> 校验容器内 API dist 是否更新"
  if docker exec ai-novel-api test -f /app/server/dist/app.js; then
    echo "容器内 /app/server/dist/app.js 存在。"
  else
    echo "警告：容器内缺少 /app/server/dist/app.js"
  fi
fi

echo "==> 云端更新完成"
