@echo off
rem Starts everything the site needs: AI intent service (port 8000), API server (port 5000) and
rem website (http://localhost:4173), each in its own window that restarts its server if it stops.
rem The same windows also start automatically when you sign in (start-zoo-autostart.cmd), so if
rem the system is already running this does nothing. Close a "Zoo ..." window to stop that server.
cd /d "%~dp0"

powershell -NoProfile -Command "$up = @(8000,5000,4173 | Where-Object { Get-NetTCPConnection -LocalPort $_ -State Listen -ErrorAction SilentlyContinue }); if ($up.Count -eq 3) { exit 1 }"
if errorlevel 1 (
  echo The Manila Zoo system is already running. Open http://localhost:4173
  exit /b 0
)

rem Each script waits instead of starting a second copy if its server is already running
start "Zoo AI service (8000)" "%~dp0deploy\autostart\ai.cmd"
start "Zoo API server (5000)" "%~dp0deploy\autostart\api.cmd"
start "Zoo website (4173)" "%~dp0deploy\autostart\web.cmd"

echo Starting... the AI service takes about 30 seconds to load its model.
echo Then open http://localhost:4173
