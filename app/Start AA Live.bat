@echo off
rem Double-click to start AA Live (the splits open in your browser). Close this window to stop it.
cd /d "%~dp0"
call "%~dp0find-node.cmd" || (pause & exit /b 1)
"%NODE%" aa-live.mjs %*
pause
