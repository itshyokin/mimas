@echo off
rem Double-click to open the map editor in your default browser (Firefox, Brave, anything).
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo The map editor needs Node.js. Install the LTS version from https://nodejs.org and try again.
  pause
  exit /b 1
)
rem Runs the small editor server in its own minimized window. Close that window to stop it.
start "Map Editor - close this window to stop" /min node "%~dp0tools\editor-server.mjs"
