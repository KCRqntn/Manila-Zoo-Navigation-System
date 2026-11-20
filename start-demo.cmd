@echo off
rem One click before a demo (the "Start Manila Zoo Demo" desktop shortcut runs this):
rem   1. starts the AI service, API and website (start-zoo.cmd) and waits until all three answer
rem   2. starts the phone link (deploy\autostart\phone-link.cmd): a public https:// link that is saved
rem      as the website's address, so every QR code works - the website / visitor registration QR,
rem      the exhibit QR codes and the printed poster - and written to current-phone-link.txt
rem   3. opens the website on this laptop and shows the phone link
rem Keep the "Zoo phone link" window open during the demo; closing it takes the site off phones.
cd /d "%~dp0"

call "%~dp0start-zoo.cmd"
echo.
echo Waiting for the AI service, API and website to be ready (about 1 minute)...
powershell -NoProfile -Command ^
  "$ports = 8000,5000,4173; for ($i = 0; $i -lt 90; $i++) { $up = @($ports | Where-Object { Get-NetTCPConnection -LocalPort $_ -State Listen -ErrorAction SilentlyContinue }); if ($up.Count -eq $ports.Count) { exit 0 }; Start-Sleep 2 }; exit 1"
if errorlevel 1 (
  echo.
  echo Something did not start. Look at the three server windows for an error, fix it, and run this again.
  pause
  exit /b 1
)
echo All three are running.
echo.

rem The phone link, unless one is already running (then its saved link is used)
set "NEED_NEW=0"
powershell -NoProfile -Command "if (Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*phoneLink.ts*' }) { exit 1 }"
if errorlevel 1 (
  echo The phone link is already running.
) else (
  echo Starting the phone link...
  set "NEED_NEW=1"
  start "Zoo phone link" /min "%~dp0deploy\autostart\phone-link.cmd"
)

echo Waiting until the phone link works from the internet and is saved (up to 3 minutes)...
powershell -NoProfile -Command ^
  "$f = Join-Path '%~dp0' 'current-phone-link.txt'; $since = if ('%NEED_NEW%' -eq '1') { (Get-Date).AddSeconds(-5) } else { [datetime]::MinValue }; for ($i = 0; $i -lt 90; $i++) { if ((Test-Path $f) -and (Get-Item $f).LastWriteTime -gt $since) { exit 0 }; Start-Sleep 2 }; exit 1"
if errorlevel 1 (
  echo.
  echo The phone link isn't ready yet. Check the "Zoo phone link" window; it keeps trying by itself.
  echo The website still works on this laptop: http://localhost:4173
) else (
  echo.
  type "%~dp0current-phone-link.txt"
)

echo.
echo Opening the website on this laptop...
start "" http://localhost:4173
echo.
echo Demo checklist:
echo   - Phones: scan the QR code (refresh any website page, or Admin ^> QR Code Access) to open Visitor Registration.
echo   - Admin: http://localhost:4173/login, then the Dashboard shows visitors from registrations.
echo   - Printed exhibit QR signs from before today need reprinting: Admin ^> Exhibit QR Codes ^> Print all.
echo.
echo You can close this window. Keep the "Zoo phone link" window open during the demo.
pause
