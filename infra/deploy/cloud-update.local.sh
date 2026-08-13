#!/usr/bin/env bash
# 本机（macOS / Linux）：增量编译并打包云更新（默认只打包，不自动 scp/ssh）
# 用法示例：
#   bash infra/deploy/cloud-update.local.sh
#   bash infra/deploy/cloud-update.local.sh --package-only
#   bash infra/deploy/cloud-update.local.sh --server --client --no-cache
#   bash infra/deploy/cloud-update.local.sh --all --upload-and-remote
#   bash infra/deploy/cloud-update.local.sh --host 220.160.32.37 --user root --remote-path /opt/ai-novel
#
# 与 Windows 版 infra/deploy/cloud-update.local.ps1 行为对齐。

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

HOST_NAME="${AI_NOVEL_CLOUD_HOST:-}"
USER_NAME="${AI_NOVEL_CLOUD_USER:-root}"
REMOTE_PATH="${AI_NOVEL_CLOUD_PATH:-/opt/ai-novel}"
SSH_PORT="${AI_NOVEL_CLOUD_SSH_PORT:-22}"

FLAG_SHARED=0
FLAG_SERVER=0
FLAG_CLIENT=0
FLAG_ALL=0
FLAG_AUTO=0
FLAG_SKIP_BUILD=0
FLAG_SKIP_UPLOAD=0
FLAG_NO_CACHE=0
FLAG_SKIP_REMOTE=0
FLAG_PACKAGE_ONLY=0
FLAG_UPLOAD_AND_REMOTE=0
HOST_SET=0
USER_SET=0
REMOTE_SET=0
PORT_SET=0

usage() {
  cat <<'EOF'
用法:
  bash infra/deploy/cloud-update.local.sh [选项]

选项:
  --host <host>            云主机地址
  --user <user>            SSH 用户（默认 root）
  --remote-path <path>     云主机仓库路径（默认 /opt/ai-novel）
  --ssh-port <port>        SSH 端口（默认 22）
  --shared / --server / --client / --all / --auto
  --skip-build             跳过本机编译
  --skip-upload            不上传
  --skip-remote            上传后不远程执行
  --no-cache               远程 docker build --no-cache
  --package-only           只编译打包并打印后续命令（默认）
  --upload-and-remote      打包后上传并远程执行（需 SSH 免密或可交互输入密码）
  -h, --help               显示帮助
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) HOST_NAME="${2:-}"; HOST_SET=1; shift 2 ;;
    --user) USER_NAME="${2:-}"; USER_SET=1; shift 2 ;;
    --remote-path) REMOTE_PATH="${2:-}"; REMOTE_SET=1; shift 2 ;;
    --ssh-port) SSH_PORT="${2:-}"; PORT_SET=1; shift 2 ;;
    --shared) FLAG_SHARED=1; shift ;;
    --server) FLAG_SERVER=1; shift ;;
    --client) FLAG_CLIENT=1; shift ;;
    --all) FLAG_ALL=1; shift ;;
    --auto) FLAG_AUTO=1; shift ;;
    --skip-build) FLAG_SKIP_BUILD=1; shift ;;
    --skip-upload) FLAG_SKIP_UPLOAD=1; shift ;;
    --skip-remote) FLAG_SKIP_REMOTE=1; shift ;;
    --no-cache) FLAG_NO_CACHE=1; shift ;;
    --package-only) FLAG_PACKAGE_ONLY=1; shift ;;
    --upload-and-remote) FLAG_UPLOAD_AND_REMOTE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "未知参数: $1" >&2
      usage
      exit 1
      ;;
  esac
done

load_env_file() {
  local env_file="$ROOT_DIR/infra/deploy/cloud-update.local.env"
  [[ -f "$env_file" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [[ -z "$line" || "$line" == \#* ]] && continue
    local key="${line%%=*}"
    local value="${line#*=}"
    key="$(echo "$key" | sed 's/[[:space:]]*$//')"
    value="$(echo "$value" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    case "$key" in
      AI_NOVEL_CLOUD_HOST)
        if [[ $HOST_SET -eq 0 ]]; then HOST_NAME="$value"; fi
        export AI_NOVEL_CLOUD_HOST="$value"
        ;;
      AI_NOVEL_CLOUD_USER)
        if [[ $USER_SET -eq 0 ]]; then USER_NAME="$value"; fi
        export AI_NOVEL_CLOUD_USER="$value"
        ;;
      AI_NOVEL_CLOUD_PATH)
        if [[ $REMOTE_SET -eq 0 ]]; then REMOTE_PATH="$value"; fi
        export AI_NOVEL_CLOUD_PATH="$value"
        ;;
      AI_NOVEL_CLOUD_SSH_PORT)
        if [[ $PORT_SET -eq 0 ]]; then SSH_PORT="$value"; fi
        export AI_NOVEL_CLOUD_SSH_PORT="$value"
        ;;
    esac
  done < "$env_file"
}

git_path_has_diff() {
  local path="$1"
  local lines
  lines="$(
    {
      git diff --name-only HEAD -- "$path"
      git diff --cached --name-only -- "$path"
      git ls-files --others --exclude-standard -- "$path"
    } 2>/dev/null | sed '/^$/d' || true
  )"
  [[ -n "$lines" ]]
}

git_head_touches_path() {
  local path="$1"
  local lines
  lines="$(git diff-tree --no-commit-id --name-only -r HEAD -- "$path" 2>/dev/null | sed '/^$/d' || true)"
  [[ -n "$lines" ]]
}

copy_tree_filtered() {
  local source="$1"
  local destination="$2"
  if [[ ! -d "$source" ]]; then
    echo "缺少目录：$source" >&2
    exit 1
  fi
  mkdir -p "$destination"
  # macOS / Linux：用 rsync 增量同步；无 rsync 时回退到 cp
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "$source"/ "$destination"/
  else
    rm -rf "$destination"
    mkdir -p "$(dirname "$destination")"
    cp -R "$source" "$destination"
  fi
}

invoke_workspace_build() {
  local filter="$1"
  export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"
  if [[ "$filter" == "@ai-novel/server" ]]; then
    pnpm --filter @ai-novel/server exec tsc -p tsconfig.json
  elif [[ "$filter" == "@ai-novel/client" || "$filter" == "client" ]]; then
    pnpm --filter @ai-novel/client build
  else
    pnpm --filter "$filter" build
  fi
}

bool_label() {
  [[ "$1" -eq 1 ]] && echo "True" || echo "False"
}

write_next_step_commands() {
  local tar_path="$1"
  local tar_name="$2"
  local need_api="$3"
  local need_web="$4"
  local ssh_target="${USER_NAME}@${HOST_NAME}"
  local remote_incoming="${REMOTE_PATH}/data/cloud/incoming"
  local local_remote_sh="$ROOT_DIR/infra/deploy/cloud-update.remote.sh"
  local local_cloud_env="$ROOT_DIR/infra/deploy/cloud.env"
  local remote_package_arg="--package data/cloud/incoming/${tar_name}"
  if [[ $FLAG_NO_CACHE -eq 1 ]]; then
    remote_package_arg+=" --no-cache"
  fi

  echo ""
  echo "========== 下一步：本机上传（zsh/bash，可整行复制） =========="
  echo "请使用 scp / ssh。"
  echo ""
  echo "scp -P ${SSH_PORT} \"${tar_path}\" ${ssh_target}:${remote_incoming}/"
  echo "scp -P ${SSH_PORT} \"${local_remote_sh}\" ${ssh_target}:${REMOTE_PATH}/infra/deploy/cloud-update.remote.sh"
  if [[ -f "$local_cloud_env" ]]; then
    echo "# 若本次改了 API_JSON_LIMIT 等云端环境变量，再传："
    echo "scp -P ${SSH_PORT} \"${local_cloud_env}\" ${ssh_target}:${REMOTE_PATH}/infra/deploy/cloud.env"
  fi

  echo ""
  echo "========== 下一步：登录云主机 =========="
  echo "ssh -p ${SSH_PORT} ${ssh_target}"

  echo ""
  echo "========== 下一步：云主机执行（可整行复制） =========="
  echo "cd ${REMOTE_PATH} && chmod +x infra/deploy/cloud-update.remote.sh && bash infra/deploy/cloud-update.remote.sh ${remote_package_arg}"
  if [[ "$need_api" -eq 1 && -f "$local_cloud_env" ]]; then
    echo "# 若刚更新了 cloud.env，再让 API 重新读环境变量："
    echo "cd ${REMOTE_PATH} && bash infra/deploy/cloud-update.remote.sh --server"
  fi

  echo ""
  echo "========== 验收（可整行复制） =========="
  echo "docker ps --filter name=ai-novel-"
  echo "docker logs ai-novel-api --tail 50"
  echo "curl -sS -u '用户名:密码' http://127.0.0.1:5173/api/health"
  echo "docker exec ai-novel-api wget -qO- http://127.0.0.1:3000/api/health"
  echo ""
  echo "范围提示：needApi=$(bool_label "$need_api") needWeb=$(bool_label "$need_web")"
}

load_env_file
HOST_NAME="${HOST_NAME:-220.160.32.37}"

if [[ $FLAG_PACKAGE_ONLY -eq 1 && $FLAG_UPLOAD_AND_REMOTE -eq 1 ]]; then
  echo "不能同时使用 --package-only 与 --upload-and-remote" >&2
  exit 1
fi
if [[ $FLAG_UPLOAD_AND_REMOTE -eq 0 ]]; then
  FLAG_PACKAGE_ONLY=1
fi
if [[ $FLAG_PACKAGE_ONLY -eq 1 ]]; then
  FLAG_SKIP_UPLOAD=1
  FLAG_SKIP_REMOTE=1
fi

if [[ $FLAG_SHARED -eq 0 && $FLAG_SERVER -eq 0 && $FLAG_CLIENT -eq 0 && $FLAG_ALL -eq 0 && $FLAG_AUTO -eq 0 ]]; then
  FLAG_AUTO=1
fi

if [[ $FLAG_ALL -eq 1 ]]; then
  FLAG_SHARED=1
  FLAG_SERVER=1
  FLAG_CLIENT=1
fi

if [[ $FLAG_AUTO -eq 1 ]]; then
  shared_changed=0
  server_changed=0
  client_changed=0
  infra_changed=0
  git_path_has_diff "shared" && shared_changed=1
  git_path_has_diff "server" && server_changed=1
  git_path_has_diff "client" && client_changed=1
  if git_path_has_diff "infra/deploy" \
    || git_path_has_diff "infra/nginx" \
    || git_path_has_diff "Dockerfile.api.prebuilt" \
    || git_path_has_diff "Dockerfile.web.prebuilt"; then
    infra_changed=1
  fi

  [[ $shared_changed -eq 1 ]] && FLAG_SHARED=1
  if [[ $server_changed -eq 1 || $shared_changed -eq 1 ]]; then FLAG_SERVER=1; fi
  if [[ $client_changed -eq 1 || $infra_changed -eq 1 ]]; then FLAG_CLIENT=1; fi

  if [[ $FLAG_SHARED -eq 0 && $FLAG_SERVER -eq 0 && $FLAG_CLIENT -eq 0 ]]; then
    shared_changed=0
    server_changed=0
    client_changed=0
    infra_changed=0
    git_head_touches_path "shared" && shared_changed=1
    git_head_touches_path "server" && server_changed=1
    git_head_touches_path "client" && client_changed=1
    if git_head_touches_path "infra/deploy" \
      || git_head_touches_path "infra/nginx" \
      || git_head_touches_path "Dockerfile.api.prebuilt" \
      || git_head_touches_path "Dockerfile.web.prebuilt"; then
      infra_changed=1
    fi
    [[ $shared_changed -eq 1 ]] && FLAG_SHARED=1
    if [[ $server_changed -eq 1 || $shared_changed -eq 1 ]]; then FLAG_SERVER=1; fi
    if [[ $client_changed -eq 1 || $infra_changed -eq 1 ]]; then FLAG_CLIENT=1; fi
  fi

  if [[ $FLAG_SHARED -eq 0 && $FLAG_SERVER -eq 0 && $FLAG_CLIENT -eq 0 ]]; then
    echo "未检测到明显变更，默认打包 shared + server（后端热修场景）。"
    FLAG_SHARED=1
    FLAG_SERVER=1
  fi
fi

# shared 变更必须同时重建 server 镜像
if [[ $FLAG_SHARED -eq 1 ]]; then
  FLAG_SERVER=1
fi

NEED_API=0
NEED_WEB=0
if [[ $FLAG_SHARED -eq 1 || $FLAG_SERVER -eq 1 ]]; then NEED_API=1; fi
if [[ $FLAG_CLIENT -eq 1 ]]; then NEED_WEB=1; fi

MODE_LABEL="UploadAndRemote（打包后上传并远程执行）"
if [[ $FLAG_PACKAGE_ONLY -eq 1 ]]; then
  MODE_LABEL="PackageOnly（只编译打包）"
fi

echo "==> 更新范围"
echo "  shared=$(bool_label "$FLAG_SHARED") server=$(bool_label "$FLAG_SERVER") client=$(bool_label "$FLAG_CLIENT")"
echo "  模式=${MODE_LABEL}"
echo "  目标 ${USER_NAME}@${HOST_NAME}:${SSH_PORT}  远程目录 ${REMOTE_PATH}"

if [[ $FLAG_SKIP_BUILD -eq 0 ]]; then
  if [[ $FLAG_SHARED -eq 1 ]]; then
    echo "==> build shared"
    invoke_workspace_build "@ai-novel/shared"
  fi
  if [[ $FLAG_SERVER -eq 1 ]]; then
    echo "==> build server"
    invoke_workspace_build "@ai-novel/server"
  fi
  if [[ $FLAG_CLIENT -eq 1 ]]; then
    echo "==> build client"
    invoke_workspace_build "@ai-novel/client"
  fi
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
STAGE_ROOT="$ROOT_DIR/infra/deploy/.cloud-stage/${STAMP}"
PAYLOAD_ROOT="$STAGE_ROOT/payload"
mkdir -p "$PAYLOAD_ROOT"

INCLUDES=()

if [[ $FLAG_SHARED -eq 1 ]]; then
  copy_tree_filtered "$ROOT_DIR/shared/dist" "$PAYLOAD_ROOT/shared/dist"
  INCLUDES+=("shared/dist")
fi
if [[ $FLAG_SERVER -eq 1 ]]; then
  copy_tree_filtered "$ROOT_DIR/server/dist" "$PAYLOAD_ROOT/server/dist"
  copy_tree_filtered "$ROOT_DIR/server/src/prisma" "$PAYLOAD_ROOT/server/src/prisma"
  mkdir -p "$PAYLOAD_ROOT/server/src/config"
  cp "$ROOT_DIR/server/src/config/database.ts" "$PAYLOAD_ROOT/server/src/config/database.ts"
  cp "$ROOT_DIR/server/prisma.config.ts" "$PAYLOAD_ROOT/server/prisma.config.ts"
  INCLUDES+=("server/dist" "server/src/prisma")
fi
if [[ $FLAG_CLIENT -eq 1 ]]; then
  copy_tree_filtered "$ROOT_DIR/client/dist" "$PAYLOAD_ROOT/client/dist"
  INCLUDES+=("client/dist")
fi

mkdir -p "$PAYLOAD_ROOT/infra/deploy" "$PAYLOAD_ROOT/infra/nginx"
cp "$ROOT_DIR/infra/deploy/api-entrypoint-sqlite.sh" "$PAYLOAD_ROOT/infra/deploy/api-entrypoint-sqlite.sh"
cp "$ROOT_DIR/infra/deploy/cloud-update.remote.sh" "$PAYLOAD_ROOT/infra/deploy/cloud-update.remote.sh"
cp "$ROOT_DIR/infra/nginx/ai-novel-cloud.conf" "$PAYLOAD_ROOT/infra/nginx/ai-novel-cloud.conf"
cp "$ROOT_DIR/Dockerfile.api.prebuilt" "$PAYLOAD_ROOT/Dockerfile.api.prebuilt"
cp "$ROOT_DIR/Dockerfile.web.prebuilt" "$PAYLOAD_ROOT/Dockerfile.web.prebuilt"
# 确保入口脚本为 LF，避免容器 crash-loop
if command -v perl >/dev/null 2>&1; then
  perl -pi -e 's/\r\n/\n/g; s/\r/\n/g' \
    "$PAYLOAD_ROOT/infra/deploy/api-entrypoint-sqlite.sh" \
    "$PAYLOAD_ROOT/infra/deploy/cloud-update.remote.sh"
elif command -v sed >/dev/null 2>&1; then
  # BSD/GNU sed 兼容的粗暴去 CR
  sed -i.bak $'s/\r$//' \
    "$PAYLOAD_ROOT/infra/deploy/api-entrypoint-sqlite.sh" \
    "$PAYLOAD_ROOT/infra/deploy/cloud-update.remote.sh"
  rm -f \
    "$PAYLOAD_ROOT/infra/deploy/api-entrypoint-sqlite.sh.bak" \
    "$PAYLOAD_ROOT/infra/deploy/cloud-update.remote.sh.bak"
fi
INCLUDES+=(
  "infra/deploy/api-entrypoint-sqlite.sh"
  "infra/deploy/cloud-update.remote.sh"
  "infra/nginx/ai-novel-cloud.conf"
  "Dockerfile.api.prebuilt"
  "Dockerfile.web.prebuilt"
)

MANIFEST_PATH="$PAYLOAD_ROOT/cloud-update.manifest.json"
INCLUDES_JSON="$(printf '%s\n' "${INCLUDES[@]}" | python3 -c 'import json,sys; print(json.dumps([l.strip() for l in sys.stdin if l.strip()]))')"
python3 - <<PY
import json
from datetime import datetime, timezone
manifest = {
  "createdAt": datetime.now(timezone.utc).astimezone().isoformat(),
  "shared": bool($FLAG_SHARED),
  "server": bool($FLAG_SERVER),
  "client": bool($FLAG_CLIENT),
  "needApi": bool($NEED_API),
  "needWeb": bool($NEED_WEB),
  "noCache": bool($FLAG_NO_CACHE),
  "includes": json.loads('''$INCLUDES_JSON'''),
}
with open(r'''$MANIFEST_PATH''', 'w', encoding='utf-8') as f:
  f.write(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
PY

TAR_NAME="ai-novel-cloud-update-${STAMP}.tgz"
TAR_PATH="$STAGE_ROOT/$TAR_NAME"

echo "==> 打包增量更新：${TAR_NAME}"
(
  cd "$PAYLOAD_ROOT"
  tar -czf "$TAR_PATH" .
)

SIZE_MB="$(python3 - <<PY
import os
print(round(os.path.getsize(r'''$TAR_PATH''') / (1024 * 1024), 2))
PY
)"
echo "  包大小约 ${SIZE_MB} MB"

if [[ $FLAG_SKIP_UPLOAD -eq 0 ]]; then
  REMOTE_INCOMING="${REMOTE_PATH}/data/cloud/incoming"
  SSH_TARGET="${USER_NAME}@${HOST_NAME}"
  echo "==> 上传到 ${SSH_TARGET}:${REMOTE_INCOMING}"
  ssh -p "$SSH_PORT" "$SSH_TARGET" "mkdir -p '${REMOTE_INCOMING}' '${REMOTE_PATH}/infra/deploy'"
  if command -v perl >/dev/null 2>&1; then
    perl -pi -e 's/\r\n/\n/g; s/\r/\n/g' "$ROOT_DIR/infra/deploy/cloud-update.remote.sh"
  fi
  scp -P "$SSH_PORT" "$ROOT_DIR/infra/deploy/cloud-update.remote.sh" \
    "${SSH_TARGET}:${REMOTE_PATH}/infra/deploy/cloud-update.remote.sh"
  scp -P "$SSH_PORT" "$TAR_PATH" "${SSH_TARGET}:${REMOTE_INCOMING}/${TAR_NAME}"

  if [[ $FLAG_SKIP_REMOTE -eq 0 ]]; then
    echo "==> 远程执行 cloud-update.remote.sh"
    REMOTE_CMD="chmod +x '${REMOTE_PATH}/infra/deploy/cloud-update.remote.sh'; cd '${REMOTE_PATH}' && bash infra/deploy/cloud-update.remote.sh --package 'data/cloud/incoming/${TAR_NAME}'"
    if [[ $FLAG_NO_CACHE -eq 1 ]]; then
      REMOTE_CMD+=" --no-cache"
    fi
    ssh -p "$SSH_PORT" "$SSH_TARGET" "$REMOTE_CMD"
  fi
fi

echo "==> 完成本地步骤"
echo "本地暂存：${STAGE_ROOT}"
echo "更新包：${TAR_PATH}"

if [[ $FLAG_PACKAGE_ONLY -eq 1 || $FLAG_SKIP_UPLOAD -eq 1 || $FLAG_SKIP_REMOTE -eq 1 ]]; then
  write_next_step_commands "$TAR_PATH" "$TAR_NAME" "$NEED_API" "$NEED_WEB"
fi
