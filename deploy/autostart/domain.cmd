@echo off
rem Keeps https://manilazoonavigationsystem.com connected to the site on this laptop (port 4173)
rem through the permanent Cloudflare tunnel "manila-zoo" (settings: %USERPROFILE%\.cloudflared\config.yml).
rem Restarts the tunnel if it stops. Close this window to take the domain offline.
title Zoo domain (manilazoonavigationsystem.com) - restarts automatically

set "CLOUDFLARED="
where cloudflared >nul 2>nul && set "CLOUDFLARED=cloudflared"
if not defined CLOUDFLARED if exist "%ProgramFiles(x86)%\cloudflared\cloudflared.exe" set "CLOUDFLARED=%ProgramFiles(x86)%\cloudflared\cloudflared.exe"
if not defined CLOUDFLARED if exist "%ProgramFiles%\cloudflared\cloudflared.exe" set "CLOUDFLARED=%ProgramFiles%\cloudflared\cloudflared.exe"
if not defined CLOUDFLARED (
  echo cloudflared is not installed. Install it with:  winget install --id Cloudflare.cloudflared
  pause
  exit /b 1
)

:loop
echo [%date% %time%] Connecting https://manilazoonavigationsystem.com ...
"%CLOUDFLARED%" tunnel run manila-zoo
echo [%date% %time%] The tunnel stopped. Reconnecting in 10 seconds (close this window to stop it)...
timeout /t 10 /nobreak >nul
goto loop
