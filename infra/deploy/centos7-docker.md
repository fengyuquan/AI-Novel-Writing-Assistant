# CentOS 7.6 + Docker 云部署（SQLite）

面向小规格云主机（2 核 / 4G / CentOS 7）的个人部署方式：Docker 里跑新系统镜像，宿主机只负责 Docker 与端口映射。

## 架构

- `api`：Node 生产服务 + SQLite（数据挂载到宿主机）
- `web`：Nginx 提供前端静态资源，并把 `/api` 反代到 `api`
- 对外只暴露 `80`（不要把 `3000` 对公网开放）

## 1. 宿主机准备（CentOS 7）

```bash
# 建议先加 4G swap，否则构建/长任务容易 OOM
sudo dd if=/dev/zero of=/swapfile bs=1M count=4096
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

sudo yum install -y yum-utils git
sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo yum install -y docker-ce docker-ce-cli containerd.io
sudo systemctl enable --now docker

# Compose v2 插件；若仓库不可用，可改装独立 docker-compose 二进制
sudo mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL https://github.com/docker/compose/releases/download/v2.29.7/docker-compose-linux-x86_64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
docker compose version
```

云厂商安全组只放行：`22`、`80`（以后有域名再开 `443`）。

## 2. 放代码

```bash
sudo mkdir -p /opt/ai-novel
sudo chown "$USER:$USER" /opt/ai-novel
git clone <你的仓库地址> /opt/ai-novel
cd /opt/ai-novel

mkdir -p data/cloud/db data/cloud/storage data/cloud/logs
cp infra/deploy/cloud.env.example infra/deploy/cloud.env
```

编辑 `infra/deploy/cloud.env`：

```env
CORS_ORIGIN=http://你的公网IP
# 有域名后改成 https://你的域名
PRISMA_ACCEPT_DATA_LOSS=false
RAG_ENABLED=false
```

## 3. 迁移本机小说库

在**本机**先停掉 `pnpm run dev`，再上传干净数据库。

本机（PowerShell 示例）：

```powershell
scp .\server\dev.db root@你的公网IP:/opt/ai-novel/data/cloud/db/dev.db
```

注意：

- 数据库路径固定为 `data/cloud/db/dev.db`
- 本机若有 `dev.db-wal` / `dev.db-shm`，先停服务再只拷主库，不要把不匹配的 wal 带到云上
- 上传前建议本机再备份一份

如果还有生成图片：

```powershell
scp -r .\server\storage\generated-images root@你的公网IP:/opt/ai-novel/data/cloud/storage/generated-images
```

## 4. 构建并启动

4G 机器本地构建偏紧，优先在本机/CI 构建后导入；若必须在云上构建：

```bash
cd /opt/ai-novel
docker compose -f infra/docker-compose.cloud.yml --env-file infra/deploy/cloud.env build
docker compose -f infra/docker-compose.cloud.yml --env-file infra/deploy/cloud.env up -d
docker compose -f infra/docker-compose.cloud.yml ps
docker compose -f infra/docker-compose.cloud.yml logs -f api
```

本机构建再导入云主机（更推荐）：

```powershell
# 本机已安装 Docker Desktop
docker compose -f infra/docker-compose.cloud.yml build
docker save ai-novel-cloud-api ai-novel-cloud-web -o ai-novel-cloud-images.tar
scp ai-novel-cloud-images.tar root@你的公网IP:/opt/ai-novel/
```

```bash
# 云主机
cd /opt/ai-novel
docker load -i ai-novel-cloud-images.tar
docker compose -f infra/docker-compose.cloud.yml --env-file infra/deploy/cloud.env up -d
```

## 5. 验证

```bash
curl -sS http://127.0.0.1/api/health
curl -sS http://你的公网IP/api/health
```

浏览器打开 `http://你的公网IP`：

1. 进入系统设置，配置模型并测连通
2. 确认小说列表是你迁过去的数据
3. 跑一个短任务，看任务中心是否正常

## 6. 常见问题

### prisma 提示 data loss

通常是旧库里有新 schema 不再使用的日志表/缓存列。先确认 `data/cloud/dev.db` 已备份，再临时：

```env
PRISMA_ACCEPT_DATA_LOSS=true
```

然后：

```bash
docker compose -f infra/docker-compose.cloud.yml --env-file infra/deploy/cloud.env up -d --force-recreate api
```

通过后建议改回 `false`。

### 页面能开但接口 502

```bash
docker compose -f infra/docker-compose.cloud.yml logs api
```

常见原因：数据库文件被挂成了目录、权限不对、或首次 schema 推送失败。

### 内存不够

```bash
free -h
docker stats
```

保持 `RAG_ENABLED=false`，不要同机再跑桌面/多余容器；确认 swap 已启用。

### 更新代码

```bash
cd /opt/ai-novel
git pull
docker compose -f infra/docker-compose.cloud.yml --env-file infra/deploy/cloud.env build
docker compose -f infra/docker-compose.cloud.yml --env-file infra/deploy/cloud.env up -d
```

更新前先备份：

```bash
cp data/cloud/db/dev.db "data/cloud/db/dev.db.bak.$(date +%Y%m%d%H%M%S)"
```

## 单用户访问门禁（推荐公网开启）

公网部署后，用 Nginx Basic Auth 拦住页面和 `/api`，浏览器会弹出登录框。

```bash
cd /opt/ai-novel
yum install -y httpd-tools openssl
mkdir -p data/cloud/auth
# 把 myuser / 你的强密码 换成自己的
htpasswd -bBc data/cloud/auth/.htpasswd myuser '你的强密码'
chmod 644 data/cloud/auth/.htpasswd

# 重建 web 镜像（需已有 client/dist 与更新后的 nginx 配置）
docker build -f Dockerfile.web.prebuilt -t ai-novel-cloud-web .

docker rm -f ai-novel-web
docker run -d \
  --name ai-novel-web \
  --network ai-novel-net \
  --restart unless-stopped \
  --memory 256m \
  -p 5173:8080 \
  -v /opt/ai-novel/data/cloud/auth/.htpasswd:/etc/nginx/auth/.htpasswd:ro \
  ai-novel-cloud-web
```

访问站点时输入上面设置的用户名和密码即可。改密码后重跑 `htpasswd`，再 `docker restart ai-novel-web`。

## 文件清单

| 文件 | 作用 |
| --- | --- |
| `Dockerfile.api.sqlite` / `Dockerfile.api.prebuilt` | API 镜像 |
| `Dockerfile.web.cloud` / `Dockerfile.web.prebuilt` | 前端 + 反代 Nginx |
| `infra/docker-compose.cloud.yml` | 编排 |
| `infra/deploy/cloud.env.example` | 环境变量模板 |
| `infra/deploy/api-entrypoint-sqlite.sh` | 启动前 schema 同步 |
| `infra/nginx/ai-novel-cloud.conf` | `/` 静态 + `/api` 反代 + 访问门禁 |
| `infra/deploy/create-site-htpasswd.sh` | 生成 `.htpasswd` |
