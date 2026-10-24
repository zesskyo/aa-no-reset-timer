@echo off
rem Double-click to start AA Live (the splits open in your browser). Close this window to stop it.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo AA Live needs Node.js. Install it from https://nodejs.org ^(the LTS one^), then double-click this again.
  pause
  exit /b 1
)
node aa-live.mjs %*
pause
