@echo off
setlocal
cd /d "%~dp0"
title Star Arm 102 - Windows Browser Test
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\start_browser_local.ps1"
if errorlevel 1 (
  echo.
  echo Startup failed. Please keep this error message for diagnosis.
  pause
)
