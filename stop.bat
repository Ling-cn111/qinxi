@echo off
rem ASCII-only launcher: real logic lives in scripts\stop.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop.ps1"
