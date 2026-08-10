# 本机：增量编译并把更新包传到云主机
# 用法示例：
#   .\infra\deploy\cloud-update.local.ps1
#   .\infra\deploy\cloud-update.local.ps1 -Shared -Server
#   .\infra\deploy\cloud-update.local.ps1 -All -NoCache
#   .\infra\deploy\cloud-update.local.ps1 -HostName 220.160.32.37 -User root -RemotePath /opt/ai-novel

[CmdletBinding()]
param(
  [string]$HostName = $env:AI_NOVEL_CLOUD_HOST,
  [string]$User = $(if ($env:AI_NOVEL_CLOUD_USER) { $env:AI_NOVEL_CLOUD_USER } else { "root" }),
  [string]$RemotePath = $(if ($env:AI_NOVEL_CLOUD_PATH) { $env:AI_NOVEL_CLOUD_PATH } else { "/opt/ai-novel" }),
  [string]$SshPort = $(if ($env:AI_NOVEL_CLOUD_SSH_PORT) { $env:AI_NOVEL_CLOUD_SSH_PORT } else { "22" }),
  [switch]$Shared,
  [switch]$Server,
  [switch]$Client,
  [switch]$All,
  [switch]$Auto,
  [switch]$SkipBuild,
  [switch]$SkipUpload,
  [switch]$NoCache,
  [switch]$SkipRemote
)

$ErrorActionPreference = "Stop"

function Resolve-RepoRoot {
  $here = Split-Path -Parent $PSCommandPath
  return (Resolve-Path (Join-Path $here "..\..")).Path
}

function Test-GitDirtyPath {
  param([string]$Root, [string]$Path)
  Push-Location $Root
  try {
    $status = git status --porcelain -- $Path 2>$null
    if ($LASTEXITCODE -ne 0) { return $false }
    return -not [string]::IsNullOrWhiteSpace($status)
  } finally {
    Pop-Location
  }
}

function Test-GitDiffPath {
  param([string]$Root, [string]$Path)
  Push-Location $Root
  try {
    $diff = git diff --name-only HEAD -- $Path 2>$null
    $cached = git diff --cached --name-only -- $Path 2>$null
    $untracked = git ls-files --others --exclude-standard -- $Path 2>$null
    $combined = @($diff) + @($cached) + @($untracked) | Where-Object { $_ }
    return $combined.Count -gt 0
  } finally {
    Pop-Location
  }
}

function Ensure-Dir([string]$Path) {
  if (-not (Test-Path $Path)) {
    New-Item -ItemType Directory -Path $Path | Out-Null
  }
}

function Copy-TreeFiltered {
  param(
    [string]$Source,
    [string]$Destination
  )
  if (-not (Test-Path $Source)) {
    throw "缺少目录：$Source"
  }
  Ensure-Dir $Destination
  # 用 robocopy 增量复制，比整树 scp 更合适
  & robocopy $Source $Destination /MIR /NFL /NDL /NJH /NJS /NP /R:1 /W:1 | Out-Null
  $code = $LASTEXITCODE
  if ($code -ge 8) {
    throw "robocopy 失败：$Source -> $Destination (exit=$code)"
  }
}

$repoRoot = Resolve-RepoRoot
Set-Location $repoRoot

$envFile = Join-Path $repoRoot "infra/deploy/cloud-update.local.env"
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $parts = $line.Split("=", 2)
    if ($parts.Count -eq 2) {
      Set-Item -Path ("Env:" + $parts[0].Trim()) -Value $parts[1].Trim()
    }
  }
  if (-not $PSBoundParameters.ContainsKey("HostName") -and $env:AI_NOVEL_CLOUD_HOST) {
    $HostName = $env:AI_NOVEL_CLOUD_HOST
  }
  if (-not $PSBoundParameters.ContainsKey("User") -and $env:AI_NOVEL_CLOUD_USER) {
    $User = $env:AI_NOVEL_CLOUD_USER
  }
  if (-not $PSBoundParameters.ContainsKey("RemotePath") -and $env:AI_NOVEL_CLOUD_PATH) {
    $RemotePath = $env:AI_NOVEL_CLOUD_PATH
  }
  if (-not $PSBoundParameters.ContainsKey("SshPort") -and $env:AI_NOVEL_CLOUD_SSH_PORT) {
    $SshPort = $env:AI_NOVEL_CLOUD_SSH_PORT
  }
}

if (-not $HostName) {
  $HostName = "220.160.32.37"
}

# 默认 Auto：按 git 变更决定打包范围；都没变则按 shared+server（最常见后端更新）
if (-not ($Shared -or $Server -or $Client -or $All -or $Auto)) {
  $Auto = $true
}

if ($All) {
  $Shared = $true
  $Server = $true
  $Client = $true
}

if ($Auto) {
  $sharedChanged = (Test-GitDiffPath $repoRoot "shared") -or (Test-GitDirtyPath $repoRoot "shared")
  $serverChanged = (Test-GitDiffPath $repoRoot "server") -or (Test-GitDirtyPath $repoRoot "server")
  $clientChanged = (Test-GitDiffPath $repoRoot "client") -or (Test-GitDirtyPath $repoRoot "client")
  $infraChanged = (Test-GitDiffPath $repoRoot "infra/deploy") `
    -or (Test-GitDiffPath $repoRoot "infra/nginx") `
    -or (Test-GitDiffPath $repoRoot "Dockerfile.api.prebuilt") `
    -or (Test-GitDiffPath $repoRoot "Dockerfile.web.prebuilt")

  if ($sharedChanged) { $Shared = $true }
  if ($serverChanged -or $sharedChanged) { $Server = $true }
  if ($clientChanged -or $infraChanged) { $Client = $true }

  if (-not ($Shared -or $Server -or $Client)) {
    Write-Host "未检测到明显变更，默认打包 shared + server（后端热修场景）。" -ForegroundColor Yellow
    $Shared = $true
    $Server = $true
  }
}

# shared 变更必须同时重建 server 镜像（镜像依赖 shared/dist）
if ($Shared) {
  $Server = $true
}

$needApi = [bool]($Shared -or $Server)
$needWeb = [bool]$Client

Write-Host "==> 更新范围" -ForegroundColor Cyan
Write-Host ("  shared={0} server={1} client={2}" -f $Shared, $Server, $Client)
Write-Host ('  目标 {0}@{1}:{2}  远程目录 {3}' -f $User, $HostName, $SshPort, $RemotePath)

if (-not $SkipBuild) {
  if ($Shared) {
    Write-Host "==> build shared" -ForegroundColor Cyan
    pnpm --filter @ai-novel/shared build
    if ($LASTEXITCODE -ne 0) { throw "shared build failed" }
  }
  if ($Server) {
    Write-Host "==> build server" -ForegroundColor Cyan
    pnpm --filter @ai-novel/server build
    if ($LASTEXITCODE -ne 0) { throw "server build failed" }
  }
  if ($Client) {
    Write-Host "==> build client" -ForegroundColor Cyan
    pnpm --filter client build
    if ($LASTEXITCODE -ne 0) { throw "client build failed" }
  }
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$stageRoot = Join-Path $repoRoot ("infra/deploy/.cloud-stage/" + $stamp)
$payloadRoot = Join-Path $stageRoot "payload"
Ensure-Dir $payloadRoot

$manifest = [ordered]@{
  createdAt = (Get-Date).ToString("o")
  shared = [bool]$Shared
  server = [bool]$Server
  client = [bool]$Client
  needApi = $needApi
  needWeb = $needWeb
  noCache = [bool]$NoCache
  includes = @()
}

if ($Shared) {
  Copy-TreeFiltered (Join-Path $repoRoot "shared/dist") (Join-Path $payloadRoot "shared/dist")
  $manifest.includes += "shared/dist"
}
if ($Server) {
  Copy-TreeFiltered (Join-Path $repoRoot "server/dist") (Join-Path $payloadRoot "server/dist")
  Copy-TreeFiltered (Join-Path $repoRoot "server/src/prisma") (Join-Path $payloadRoot "server/src/prisma")
  Ensure-Dir (Join-Path $payloadRoot "server/src/config")
  Copy-Item (Join-Path $repoRoot "server/src/config/database.ts") (Join-Path $payloadRoot "server/src/config/database.ts") -Force
  Copy-Item (Join-Path $repoRoot "server/prisma.config.ts") (Join-Path $payloadRoot "server/prisma.config.ts") -Force
  $manifest.includes += "server/dist"
  $manifest.includes += "server/src/prisma"
}
if ($Client) {
  Copy-TreeFiltered (Join-Path $repoRoot "client/dist") (Join-Path $payloadRoot "client/dist")
  $manifest.includes += "client/dist"
}

# 部署相关文件尽量随包带上，体量很小
Ensure-Dir (Join-Path $payloadRoot "infra/deploy")
Ensure-Dir (Join-Path $payloadRoot "infra/nginx")
Copy-Item (Join-Path $repoRoot "infra/deploy/api-entrypoint-sqlite.sh") (Join-Path $payloadRoot "infra/deploy/api-entrypoint-sqlite.sh") -Force
Copy-Item (Join-Path $repoRoot "infra/deploy/cloud-update.remote.sh") (Join-Path $payloadRoot "infra/deploy/cloud-update.remote.sh") -Force
Copy-Item (Join-Path $repoRoot "infra/nginx/ai-novel-cloud.conf") (Join-Path $payloadRoot "infra/nginx/ai-novel-cloud.conf") -Force
Copy-Item (Join-Path $repoRoot "Dockerfile.api.prebuilt") (Join-Path $payloadRoot "Dockerfile.api.prebuilt") -Force
Copy-Item (Join-Path $repoRoot "Dockerfile.web.prebuilt") (Join-Path $payloadRoot "Dockerfile.web.prebuilt") -Force
$manifest.includes += @(
  "infra/deploy/api-entrypoint-sqlite.sh",
  "infra/deploy/cloud-update.remote.sh",
  "infra/nginx/ai-novel-cloud.conf",
  "Dockerfile.api.prebuilt",
  "Dockerfile.web.prebuilt"
)

$manifestPath = Join-Path $payloadRoot "cloud-update.manifest.json"
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($manifestPath, (($manifest | ConvertTo-Json -Depth 5) + "`n"), $utf8NoBom)

$tarName = "ai-novel-cloud-update-$stamp.tgz"
$tarPath = Join-Path $stageRoot $tarName

Write-Host "==> 打包增量更新：$tarName" -ForegroundColor Cyan
Push-Location $payloadRoot
try {
  # 优先 tar；Windows 10+ 通常有 tar
  & tar -czf $tarPath *
  if ($LASTEXITCODE -ne 0) { throw "打包失败" }
} finally {
  Pop-Location
}

$sizeMb = [math]::Round((Get-Item $tarPath).Length / 1MB, 2)
Write-Host ("  包大小约 {0} MB" -f $sizeMb)

if (-not $SkipUpload) {
  $remoteIncoming = "$RemotePath/data/cloud/incoming"
  Write-Host "==> 上传到 ${User}@${HostName}:$remoteIncoming" -ForegroundColor Cyan
  $sshTarget = "${User}@${HostName}"
  & ssh -p $SshPort $sshTarget "mkdir -p '$remoteIncoming' '$RemotePath/infra/deploy'"
  if ($LASTEXITCODE -ne 0) { throw "ssh mkdir 失败" }

  # 先保证远程有更新脚本（首次部署或脚本本身有改动时）
  & scp -P $SshPort (Join-Path $repoRoot "infra/deploy/cloud-update.remote.sh") `
    "${sshTarget}:${RemotePath}/infra/deploy/cloud-update.remote.sh"
  if ($LASTEXITCODE -ne 0) { throw "上传 remote 脚本失败" }

  & scp -P $SshPort $tarPath "${sshTarget}:${remoteIncoming}/$tarName"
  if ($LASTEXITCODE -ne 0) { throw "scp 更新包失败" }

  if (-not $SkipRemote) {
    Write-Host "==> 远程执行 cloud-update.remote.sh" -ForegroundColor Cyan
    $remoteCmd = "chmod +x '$RemotePath/infra/deploy/cloud-update.remote.sh'; cd '$RemotePath' && bash infra/deploy/cloud-update.remote.sh --package 'data/cloud/incoming/$tarName'"
    if ($NoCache) { $remoteCmd += " --no-cache" }
    & ssh -p $SshPort $sshTarget $remoteCmd
    if ($LASTEXITCODE -ne 0) { throw "远程更新失败" }
  } else {
    Write-Host "已跳过远程执行。请在云主机运行：" -ForegroundColor Yellow
    Write-Host ("  cd {0}; bash infra/deploy/cloud-update.remote.sh --package data/cloud/incoming/{1}" -f $RemotePath, $tarName)
  }
}

Write-Host "==> 完成本地步骤" -ForegroundColor Green
Write-Host ("本地暂存：{0}" -f $stageRoot)
Write-Host ("更新包：{0}" -f $tarPath)
