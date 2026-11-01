@echo off
rem Double-click to open the Character Builder (characters and weapons) in your default browser.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo The Character Builder needs Node.js. Install the LTS version from https://nodejs.org and try again.
  pause
  exit /b 1
)
if not exist "%~dp0tools\lpc\library\catalog.json" (
  echo The parts library is missing: tools\lpc\library\catalog.json should be in this folder.
  echo Download the engine again (it includes the library^), or rebuild it with tools\lpc\build_lpc.py.
  pause
  exit /b 1
)
rem Runs the small editor server (the same one the map editor uses) in its own minimized window. Close it to stop.
start "Character Builder - close this window to stop" /min node "%~dp0tools\editor-server.mjs" builder
