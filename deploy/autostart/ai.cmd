@echo off
rem Keeps the AI intent service (port 8000) running: starts it, and restarts it if it stops.
rem If something is already using port 8000 (e.g. started by start-zoo.cmd), it waits and takes over later.
title Zoo AI service (8000) - restarts automatically
cd /d "%~dp0..\..\ai-training"
set "PY=python"
if exist "%~dp0..\..\..\.venv\Scripts\python.exe" set "PY=%~dp0..\..\..\.venv\Scripts\python.exe"
if exist "%~dp0..\..\.venv\Scripts\python.exe" set "PY=%~dp0..\..\.venv\Scripts\python.exe"

:loop
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue) { exit 1 }"
if errorlevel 1 (
  timeout /t 30 /nobreak >nul
  goto loop
)
echo [%date% %time%] Starting the AI service...
"%PY%" -m uvicorn predict_api:app --host 127.0.0.1 --port 8000
echo [%date% %time%] The AI service stopped. Restarting in 10 seconds (close this window to stop it)...
timeout /t 10 /nobreak >nul
goto loop
