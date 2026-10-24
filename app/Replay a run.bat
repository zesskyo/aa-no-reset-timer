@echo off
rem Double-click to play back a run that's already done (from your stats site, or a play.log), to see how the splits behave.
cd /d "%~dp0"
call "%~dp0find-node.cmd" || (pause & exit /b 1)
echo Which run? Type its number on your stats site (like 27), or drag a play.log onto this window, then press Enter:
set /p RUN=
set RUN=%RUN:"=%
"%NODE%" aa-live.mjs --replay "%RUN%" %*
pause
