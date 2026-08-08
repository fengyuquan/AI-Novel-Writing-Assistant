#!/bin/sh
# 生成 Nginx basic auth 密码文件
# 用法：
#   ./create-site-htpasswd.sh <用户名> <密码> [输出路径]
set -eu

USER_NAME="${1:-}"
PASSWORD="${2:-}"
OUT_PATH="${3:-./data/cloud/auth/.htpasswd}"

if [ -z "$USER_NAME" ] || [ -z "$PASSWORD" ]; then
  echo "用法: $0 <用户名> <密码> [输出路径]"
  exit 1
fi

mkdir -p "$(dirname "$OUT_PATH")"

if command -v htpasswd >/dev/null 2>&1; then
  htpasswd -bBc "$OUT_PATH" "$USER_NAME" "$PASSWORD"
elif command -v openssl >/dev/null 2>&1; then
  HASH="$(openssl passwd -apr1 "$PASSWORD")"
  printf '%s:%s\n' "$USER_NAME" "$HASH" >"$OUT_PATH"
else
  echo "需要 htpasswd 或 openssl"
  exit 1
fi

chmod 644 "$OUT_PATH"
echo "已写入: $OUT_PATH"
echo "用户名: $USER_NAME"
