# 琴习 QinXi 停止脚本（由根目录 stop.bat 调起）

$host.UI.RawUI.WindowTitle = '琴习 QinXi - 停止'
$found = $false

foreach ($port in 5173..5178) {
  $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($conn in $conns) {
    $pid2 = $conn.OwningProcess
    try {
      Stop-Process -Id $pid2 -Force -ErrorAction Stop
      $found = $true
      Write-Host "[琴习] 已停止端口 $port 上的服务（PID $pid2）"
    } catch {
      Write-Host "[琴习] 端口 $port 上的进程（PID $pid2）停止失败：$_"
    }
  }
}

if (-not $found) {
  Write-Host '[琴习] 当前没有正在运行的开发服务器。'
} else {
  Write-Host '[琴习] 已关闭。'
}
