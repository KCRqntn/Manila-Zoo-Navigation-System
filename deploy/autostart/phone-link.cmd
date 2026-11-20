@echo off
rem Keeps a public https:// phone link to the website running, and saves each new link as the website's
rem public address so the "access the website" QR code always works (see artifacts\api-server\src\phoneLink.ts).
rem The current link is also written to current-phone-link.txt in the project folder.
title Zoo phone link - restarts automatically
cd /d "%~dp0..\..\artifacts\api-server"

:loop
echo [%date% %time%] Starting the phone link keeper...
call npx tsx --env-file=../../.env ./src/phoneLink.ts
rem Exit code 0: the permanent domain was saved, so there's nothing to keep running
if not errorlevel 1 (
  echo Saved https://manilazoonavigationsystem.com as the website address. You can close this window.
  pause
  exit /b 0
)
echo [%date% %time%] The phone link keeper stopped. Restarting in 15 seconds (close this window to stop it)...
timeout /t 15 /nobreak >nul
goto loop
