@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"
title 琴习 QinXi - 停止

set FOUND=0
for %%P in (5173 5174 5175 5176 5177 5178) do (
  for /f "tokens=5" %%A in ('netstat -ano ^| findstr /r /c:":%%P .*LISTENING"') do (
    taskkill /PID %%A /T /F >nul 2>nul
    if not errorlevel 1 (
      set FOUND=1
      echo [琴习] 已停止端口 %%P 上的服务（PID %%A）
    )
  )
)

if "!FOUND!"=="0" (
  echo [琴习] 当前没有正在运行的开发服务器。
) else (
  echo [琴习] 已关闭。
)

ping -n 2 127.0.0.1 >nul
