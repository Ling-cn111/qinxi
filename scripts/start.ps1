# 琴习 QinXi 启动脚本（由根目录 start.bat 调起；bat 壳保持纯 ASCII，
# 中文逻辑放这里 —— cmd 批处理的块缓冲会把跨边界的多字节字符拦腰切断，PowerShell 无此问题）

$ErrorActionPreference = 'Continue'
Set-Location -LiteralPath (Join-Path $PSScriptRoot '..')
$root = (Get-Location).Path
$host.UI.RawUI.WindowTitle = '琴习 QinXi'

Write-Host ''

# ---- 1. Node.js 必须存在
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host '[琴习] 没有找到 Node.js，请先安装：https://nodejs.org/' -ForegroundColor Yellow
  Read-Host '按回车退出'
  exit 1
}

$needInstall = $false
$snap = Join-Path $root '.qinxi-deps.lock'

# ---- 2a. node_modules 整个不存在 = 从没装过
if (-not (Test-Path (Join-Path $root 'node_modules'))) {
  Write-Host '[琴习] 没有检测到 node_modules，需要安装依赖。'
  $needInstall = $true
} else {
  # ---- 2b. 关键依赖逐个确认（P5 起包含 @tonejs/midi 与 @webmusic/score）
  foreach ($dep in @('vite', 'vue', '@tonejs\midi', '@webmusic\score')) {
    if (-not (Test-Path (Join-Path $root "node_modules\$dep"))) {
      Write-Host "[琴习] 缺少依赖：$dep，需要补装。"
      $needInstall = $true
    }
  }
}

# ---- 2c. package-lock.json 与上次安装时的快照按内容哈希比对
if (-not $needInstall) {
  if (-not (Test-Path $snap)) {
    Write-Host '[琴习] 首次使用启动脚本，先核对一遍依赖。'
    $needInstall = $true
  } elseif ((Get-FileHash (Join-Path $root 'package-lock.json')).Hash -ne (Get-FileHash $snap).Hash) {
    Write-Host '[琴习] 依赖清单有更新（package-lock.json 变动）。'
    $needInstall = $true
  }
}

# ---- 3. 按需安装
if ($needInstall) {
  Write-Host '[琴习] 正在安装 / 更新依赖，请稍候……'
  & npm install
  if ($LASTEXITCODE -ne 0) {
    Write-Host '[琴习] 依赖安装失败，请检查网络后重试。' -ForegroundColor Yellow
    Read-Host '按回车退出'
    exit 1
  }
  Copy-Item (Join-Path $root 'package-lock.json') $snap -Force
  Write-Host '[琴习] 依赖就绪。'
} else {
  Write-Host '[琴习] 依赖完整，跳过安装。'
}

Write-Host '[琴习] 开发服务器：http://127.0.0.1:5173'
Write-Host '[琴习] 浏览器会自动打开；不想自动打开，把下面命令里的 --open 删掉即可。'
Write-Host '[琴习] 保持本窗口开着；关掉窗口就停止，也可以双击 stop.bat。'
Write-Host ''

& npm run dev -- --port 5173 --strictPort --open

Write-Host ''
Write-Host '[琴习] 开发服务器已停止。'
Read-Host '按回车退出'
