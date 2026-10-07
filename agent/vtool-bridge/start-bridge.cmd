@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required to run this bridge. Install Node.js, then try again.
  pause
  exit /b 1
)
echo For a deployed website, set TOOLKIT_ORIGIN to its exact origin before launching.
node bridge.mjs
pause
