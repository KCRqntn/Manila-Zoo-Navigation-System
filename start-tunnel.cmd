@echo off
rem Gives the site running on this laptop a temporary public https:// link (Cloudflare quick tunnel),
rem so phones anywhere can open it and use GPS. Run start-zoo.cmd first and keep this window open.
rem The link stops working when you close this window, and changes every time you run it.
cd /d "%~dp0"

rem Use cloudflared from PATH, or straight from its install folder (a terminal opened before the
rem install doesn't see the updated PATH yet)
set "CLOUDFLARED="
where cloudflared >nul 2>nul && set "CLOUDFLARED=cloudflared"
if not defined CLOUDFLARED if exist "%ProgramFiles(x86)%\cloudflared\cloudflared.exe" set "CLOUDFLARED=%ProgramFiles(x86)%\cloudflared\cloudflared.exe"
if not defined CLOUDFLARED if exist "%ProgramFiles%\cloudflared\cloudflared.exe" set "CLOUDFLARED=%ProgramFiles%\cloudflared\cloudflared.exe"
if not defined CLOUDFLARED (
  echo cloudflared is not installed. Install it once with:
  echo.
  echo     winget install --id Cloudflare.cloudflared
  echo.
  echo then close this window, open a new one, and run start-tunnel.cmd again.
  pause
  exit /b 1
)

powershell -NoProfile -Command "if (-not (Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue)) { exit 1 }"
if errorlevel 1 (
  echo The website is not running on port 4173. Run start-zoo.cmd first, wait a minute, then try again.
  pause
  exit /b 1
)

echo Starting the tunnel... look for a line with https://something.trycloudflare.com below.
echo Open that link on any phone. Anyone with the link can see the site; close this window to stop it.
echo.
"%CLOUDFLARED%" tunnel --url http://127.0.0.1:4173
