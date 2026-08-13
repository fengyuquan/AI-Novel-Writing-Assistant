# 本机：增量编译并打包云更新（默认只打包，不自动 scp/ssh）
# 用法示例：
#   .\infra\deploy\cloud-update.local.ps1
#   .\infra\deploy\cloud-update.local.ps1 -PackageOnly
#   .\infra\deploy\cloud-update.local.ps1 -Server -Client -NoCache
#   .\infra\deploy\cloud-update.local.ps1 -All -UploadAndRemote   # 需 SSH 免密或可交互输入密码
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
  [switch]$SkipRemote,
  # 只编译打包，打印后续 scp / 云主机命令（推荐默认流程）
  [switch]$PackageOnly,
  # 本机打包后继续上传并远程执行（需要能交互输入密码，或已配置 SSH 免密）
  [switch]$UploadAndRemote
)

$ErrorActionPreference = "Stop"

function Resolve-RepoRoot {
  $here = Split-Path -Parent $PSCommandPath
  return (Resolve-Path (Join-Path $here "..\..")).Path
}

function Invoke-GitQuiet {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    # git 常把 CRLF 提示打到 stderr；在 ErrorActionPreference=Stop 下会被当成终止错误
    $output = & git @Arguments 2>&1
    $code = $LASTEXITCODE
    $lines = @($output) | ForEach-Object {
      if ($_ -is [System.Management.Automation.ErrorRecord]) {
        $_.ToString()
      } else {
        "$_"
      }
    } | Where-Object {
      $_ -and ($_ -notmatch '^(warning|hint):')
    }
    return [pscustomobject]@{
      ExitCode = $code
      Lines = $lines
    }
  } finally {
    $ErrorActionPreference = $prev
  }
}

function Test-GitDirtyPath {
  param([string]$Root, [string]$Path)
  Push-Location $Root
  try {
    $result = Invoke-GitQuiet -Arguments @("status", "--porcelain", "--", $Path)
    if ($result.ExitCode -ne 0) { return $false }
    return ($result.Lines | Where-Object { $_ }).Count -gt 0
  } finally {
    Pop-Location
  }
}

function Test-GitDiffPath {
  param([string]$Root, [string]$Path)
  Push-Location $Root
  try {
    $diff = Invoke-GitQuiet -Arguments @("diff", "--name-only", "HEAD", "--", $Path)
    $cached = Invoke-GitQuiet -Arguments @("diff", "--cached", "--name-only", "--", $Path)
    $untracked = Invoke-GitQuiet -Arguments @("ls-files", "--others", "--exclude-standard", "--", $Path)
    $combined = @($diff.Lines) + @($cached.Lines) + @($untracked.Lines) | Where-Object { $_ }
    return $combined.Count -gt 0
  } finally {
    Pop-Location
  }
}

function Test-GitHeadTouchesPath {
  param([string]$Root, [string]$Path)
  Push-Location $Root
  try {
    $result = Invoke-GitQuiet -Arguments @("diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD", "--", $Path)
    if ($result.ExitCode -ne 0) { return $false }
    return ($result.Lines | Where-Object { $_ }).Count -gt 0
  } finally {
    Pop-Location
  }
}

function Convert-ToUnixLf([string]$Path) {
  if (-not (Test-Path $Path)) { return }
  $bytes = [System.IO.File]::ReadAllBytes($Path)
  $text = [System.Text.Encoding]::UTF8.GetString($bytes)
  $normalized = $text -replace "`r`n", "`n" -replace "`r", "`n"
  $utf8NoBom = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($Path, $normalized, $utf8NoBom)
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

function Invoke-WorkspaceBuild {
  param(
    [string]$Filter
  )
  # Windows PowerShell 无法直接执行 package.json 里的 NODE_OPTIONS='...' bash 语法
  if (-not $env:NODE_OPTIONS) {
    $env:NODE_OPTIONS = "--max-old-space-size=4096"
  }
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    # 必须把 pnpm 输出写到 Host，否则会混进函数返回值，导致 $code -ne 0 误判失败
    if ($Filter -eq "@ai-novel/server") {
      & pnpm --filter @ai-novel/server exec tsc -p tsconfig.json 2>&1 | ForEach-Object { Write-Host $_ }
    } elseif ($Filter -eq "@ai-novel/client" -or $Filter -eq "client") {
      & pnpm --filter @ai-novel/client build 2>&1 | ForEach-Object { Write-Host $_ }
    } else {
      & pnpm --filter $Filter build 2>&1 | ForEach-Object { Write-Host $_ }
    }
    if ($null -eq $LASTEXITCODE) { return 0 }
    return [int]$LASTEXITCODE
  } finally {
    $ErrorActionPreference = $prev
  }
}

function Write-NextStepCommands {
  param(
    [string]$RepoRoot,
    [string]$TarPath,
    [string]$TarName,
    [string]$User,
    [string]$HostName,
    [string]$SshPort,
    [string]$RemotePath,
    [bool]$NoCache,
    [bool]$NeedApi,
    [bool]$NeedWeb
  )

  $sshTarget = "${User}@${HostName}"
  $remoteIncoming = "$RemotePath/data/cloud/incoming"
  $localRemoteSh = Join-Path $RepoRoot "infra\deploy\cloud-update.remote.sh"
  $localCloudEnv = Join-Path $RepoRoot "infra\deploy\cloud.env"
  $remotePackageArg = "--package data/cloud/incoming/$TarName"
  if ($NoCache) { $remotePackageArg += " --no-cache" }

  Write-Host ""
  Write-Host "========== 下一步：本机上传（PowerShell，可整行复制） ==========" -ForegroundColor Cyan
  Write-Host "请使用 scp.exe / ssh.exe（不要用 cp）。"
  Write-Host ""
  Write-Host ("scp.exe -P {0} `"{1}`" {2}:{3}/" -f $SshPort, $TarPath, $sshTarget, $remoteIncoming)
  Write-Host ("scp.exe -P {0} `"{1}`" {2}:{3}/infra/deploy/cloud-update.remote.sh" -f $SshPort, $localRemoteSh, $sshTarget, $RemotePath)
  if (Test-Path $localCloudEnv) {
    Write-Host "# 若本次改了 API_JSON_LIMIT 等云端环境变量，再传："
    Write-Host ("scp.exe -P {0} `"{1}`" {2}:{3}/infra/deploy/cloud.env" -f $SshPort, $localCloudEnv, $sshTarget, $RemotePath)
  }

  Write-Host ""
  Write-Host "========== 下一步：登录云主机 ==========" -ForegroundColor Cyan
  Write-Host ("ssh.exe -p {0} {1}" -f $SshPort, $sshTarget)

  Write-Host ""
  Write-Host "========== 下一步：云主机执行（可整行复制） ==========" -ForegroundColor Cyan
  Write-Host ("cd {0} && chmod +x infra/deploy/cloud-update.remote.sh && bash infra/deploy/cloud-update.remote.sh {1}" -f $RemotePath, $remotePackageArg)
  if ($NeedApi -and (Test-Path $localCloudEnv)) {
    Write-Host "# 若刚更新了 cloud.env，再让 API 重新读环境变量："
    Write-Host ("cd {0} && bash infra/deploy/cloud-update.remote.sh --server" -f $RemotePath)
  }

  Write-Host ""
  Write-Host "========== 验收（可整行复制） ==========" -ForegroundColor Cyan
  Write-Host "docker ps --filter name=ai-novel-"
  Write-Host "docker logs ai-novel-api --tail 50"
  Write-Host "curl -sS -u '用户名:密码' http://127.0.0.1:5173/api/health"
  Write-Host "docker exec ai-novel-api wget -qO- http://127.0.0.1:3000/api/health"
  Write-Host ""
  Write-Host ("范围提示：needApi={0} needWeb={1}" -f $NeedApi, $NeedWeb)
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

# 默认：只打包。需要全自动上传时显式传 -UploadAndRemote
if ($PackageOnly -and $UploadAndRemote) {
  throw "不能同时使用 -PackageOnly 与 -UploadAndRemote"
}
if (-not $UploadAndRemote) {
  $PackageOnly = $true
}
if ($PackageOnly) {
  $SkipUpload = $true
  $SkipRemote = $true
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
    # 工作区干净时，按最近一次提交触及的路径推断（适合：先 commit 再打包）
    $sharedChanged = Test-GitHeadTouchesPath $repoRoot "shared"
    $serverChanged = Test-GitHeadTouchesPath $repoRoot "server"
    $clientChanged = Test-GitHeadTouchesPath $repoRoot "client"
    $infraChanged = (Test-GitHeadTouchesPath $repoRoot "infra/deploy") `
      -or (Test-GitHeadTouchesPath $repoRoot "infra/nginx") `
      -or (Test-GitHeadTouchesPath $repoRoot "Dockerfile.api.prebuilt") `
      -or (Test-GitHeadTouchesPath $repoRoot "Dockerfile.web.prebuilt")
    if ($sharedChanged) { $Shared = $true }
    if ($serverChanged -or $sharedChanged) { $Server = $true }
    if ($clientChanged -or $infraChanged) { $Client = $true }
  }

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
Write-Host ("  模式={0}" -f $(if ($PackageOnly) { "PackageOnly（只编译打包）" } else { "UploadAndRemote（打包后上传并远程执行）" }))
Write-Host ('  目标 {0}@{1}:{2}  远程目录 {3}' -f $User, $HostName, $SshPort, $RemotePath)

if (-not $SkipBuild) {
  if ($Shared) {
    Write-Host "==> build shared" -ForegroundColor Cyan
    $code = Invoke-WorkspaceBuild -Filter "@ai-novel/shared"
    if ($code -ne 0) { throw "shared build failed" }
  }
  if ($Server) {
    Write-Host "==> build server" -ForegroundColor Cyan
    $code = Invoke-WorkspaceBuild -Filter "@ai-novel/server"
    if ($code -ne 0) { throw "server build failed" }
  }
  if ($Client) {
    Write-Host "==> build client" -ForegroundColor Cyan
    $code = Invoke-WorkspaceBuild -Filter "@ai-novel/client"
    if ($code -ne 0) { throw "client build failed" }
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
# Windows checkout may keep CRLF; Linux entrypoint must be LF or the container crash-loops.
Convert-ToUnixLf (Join-Path $payloadRoot "infra/deploy/api-entrypoint-sqlite.sh")
Convert-ToUnixLf (Join-Path $payloadRoot "infra/deploy/cloud-update.remote.sh")
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
  # 显式 scp.exe/ssh.exe，避免 PowerShell 把 scp/cp 解析错
  & ssh.exe -p $SshPort $sshTarget "mkdir -p '$remoteIncoming' '$RemotePath/infra/deploy'"
  if ($LASTEXITCODE -ne 0) { throw "ssh mkdir 失败" }

  Convert-ToUnixLf (Join-Path $repoRoot "infra/deploy/cloud-update.remote.sh")
  & scp.exe -P $SshPort (Join-Path $repoRoot "infra/deploy/cloud-update.remote.sh") `
    "${sshTarget}:${RemotePath}/infra/deploy/cloud-update.remote.sh"
  if ($LASTEXITCODE -ne 0) { throw "上传 remote 脚本失败" }

  & scp.exe -P $SshPort $tarPath "${sshTarget}:${remoteIncoming}/$tarName"
  if ($LASTEXITCODE -ne 0) { throw "scp 更新包失败" }

  if (-not $SkipRemote) {
    Write-Host "==> 远程执行 cloud-update.remote.sh" -ForegroundColor Cyan
    $remoteCmd = "chmod +x '$RemotePath/infra/deploy/cloud-update.remote.sh'; cd '$RemotePath' && bash infra/deploy/cloud-update.remote.sh --package 'data/cloud/incoming/$tarName'"
    if ($NoCache) { $remoteCmd += " --no-cache" }
    & ssh.exe -p $SshPort $sshTarget $remoteCmd
    if ($LASTEXITCODE -ne 0) { throw "远程更新失败" }
  }
}

Write-Host "==> 完成本地步骤" -ForegroundColor Green
Write-Host ("本地暂存：{0}" -f $stageRoot)
Write-Host ("更新包：{0}" -f $tarPath)

if ($PackageOnly -or $SkipUpload -or $SkipRemote) {
  Write-NextStepCommands `
    -RepoRoot $repoRoot `
    -TarPath $tarPath `
    -TarName $tarName `
    -User $User `
    -HostName $HostName `
    -SshPort $SshPort `
    -RemotePath $RemotePath `
    -NoCache:([bool]$NoCache) `
    -NeedApi:$needApi `
    -NeedWeb:$needWeb
}
