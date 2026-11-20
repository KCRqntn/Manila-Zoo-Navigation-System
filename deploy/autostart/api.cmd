@echo off
rem Keeps the API server (port 5000) running: builds and starts it, and restarts it if it stops.
rem If something is already using port 5000, it waits and takes over later.
title Zoo API server (5000) - restarts automatically
cd /d "%~dp0..\..\artifacts\api-server"
set PORT=5000

:loop
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue) { exit 1 }"
if errorlevel 1 (
  timeout /t 30 /nobreak >nul
  goto loop
)
echo [%date% %time%] Starting the API server...
call pnpm run dev
echo [%date% %time%] The API server stopped. Restarting in 10 seconds (close this window to stop it)...
timeout /t 10 /nobreak >nul
goto loop
