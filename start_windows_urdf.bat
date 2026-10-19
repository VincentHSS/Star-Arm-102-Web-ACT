@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\start_browser_local.ps1" -StartPage index.html
if errorlevel 1 pause
