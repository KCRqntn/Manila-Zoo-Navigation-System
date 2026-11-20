@echo off
rem Keeps the website (http://localhost:4173) running: serves the built site, and restarts it if it stops
rem (it also stops by itself when the site is rebuilt). Builds the site first if it was never built.
rem If something is already using port 4173, it waits and takes over later.
title Zoo website (4173) - restarts automatically
cd /d "%~dp0..\..\artifacts\manila-zoo"
set PORT=4173

:loop
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue) { exit 1 }"
if errorlevel 1 (
  timeout /t 30 /nobreak >nul
  goto loop
)
if not exist "dist\public\index.html" (
  echo [%date% %time%] Building the website first...
  call pnpm run build
)
echo [%date% %time%] Starting the website on http://localhost:4173 ...
call pnpm run serve
echo [%date% %time%] The website stopped. Restarting in 10 seconds (close this window to stop it)...
timeout /t 10 /nobreak >nul
goto loop
