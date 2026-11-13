@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title 琴习 QinXi

where node >nul 2>nul
if errorlevel 1 (
  echo [琴习] 没有找到 Node.js，请先安装：https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [琴习] 首次启动，正在安装依赖，请稍候……
  call npm install
  if errorlevel 1 (
    echo [琴习] 依赖安装失败，请检查网络后重试。
    pause
    exit /b 1
  )
)

echo [琴习] 开发服务器：http://127.0.0.1:5173
echo [琴习] 浏览器会自动打开；不想自动打开，删掉下面命令里的 --open 即可。
echo [琴习] 保持本窗口开着；关掉窗口就停止，也可以双击 stop.bat。
echo.

call npm run dev -- --port 5173 --strictPort --open

echo.
echo [琴习] 开发服务器已停止。
pause
