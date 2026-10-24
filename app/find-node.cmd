@echo off
rem Finds Node.js for AA Live: the one installed, or else a copy of its own in app\node, downloaded from nodejs.org the
rem first time (checked against nodejs.org's checksums). Sets NODE to it. (Called by the other .bat files.)
set "NODE=node"
where node >nul 2>nul
if not errorlevel 1 exit /b 0
set "NODE=%~dp0node\node.exe"
if exist "%NODE%" exit /b 0
echo Node.js isn't installed, so AA Live is downloading its own copy (about 30 MB, only this once)...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;" ^
  "$v = 'v22.11.0'; $a = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' };" ^
  "$name = 'node-' + $v + '-win-' + $a; $base = 'https://nodejs.org/dist/' + $v + '/';" ^
  "$zip = Join-Path $env:TEMP ($name + '.zip'); Invoke-WebRequest ($base + $name + '.zip') -OutFile $zip -UseBasicParsing;" ^
  "$sums = (Invoke-WebRequest ($base + 'SHASUMS256.txt') -UseBasicParsing).Content;" ^
  "$want = ($sums -split [char]10 | Where-Object { $_ -like ('* ' + $name + '.zip') }) -split ' ' | Select-Object -First 1;" ^
  "if ((Get-FileHash $zip -Algorithm SHA256).Hash -ne $want.ToUpper()) { throw 'the download is not the one nodejs.org published' };" ^
  "$tmp = Join-Path $env:TEMP 'aa-live-node'; if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force };" ^
  "Expand-Archive $zip $tmp; Move-Item (Join-Path $tmp $name) '%~dp0node'; Remove-Item $zip, $tmp -Recurse -Force"
if exist "%NODE%" (echo Done.& exit /b 0)
echo Couldn't download Node.js. Install it from https://nodejs.org ^(the LTS one^), then double-click this again.
exit /b 1
