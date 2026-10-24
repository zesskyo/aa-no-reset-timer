@echo off
rem Double-click to play back a run that's already done (from your stats site, or a play.log), to see how the splits behave.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo AA Live needs Node.js. Install it from https://nodejs.org ^(the LTS one^), then double-click this again.
  pause
  exit /b 1
)
echo Which run? Type its number on your stats site (like 27), or drag a play.log onto this window, then press Enter:
set /p RUN=
set RUN=%RUN:"=%
node aa-live.mjs --replay "%RUN%" %*
pause
