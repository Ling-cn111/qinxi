@echo off
rem ASCII-only launcher: real logic lives in scripts\start.ps1
rem (cmd chokes on multi-byte chars near its read-buffer boundaries)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1"
