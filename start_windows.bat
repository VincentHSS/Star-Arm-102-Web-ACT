@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 (
  py -3 tools\serve_local.py %*
  if errorlevel 1 pause
  exit /b
)
where python >nul 2>nul
if not errorlevel 1 (
  python tools\serve_local.py %*
  if errorlevel 1 pause
  exit /b
)
echo Python 3.10-3.12 is required. Install Python and enable Add Python to PATH.
pause
exit /b 1
