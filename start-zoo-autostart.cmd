@echo off
rem Starts the Manila Zoo system in three minimised windows that restart their server if it stops:
rem   AI service (port 8000), API (port 5000), website (http://localhost:4173).
rem Runs automatically when you sign in to Windows (a shortcut in the Startup folder).
rem To turn that off, delete "Manila Zoo (auto-start)" from:  shell:startup
rem To stop the system now, close the three "Zoo ..." windows.
cd /d "%~dp0"
start "Zoo AI service (8000)" /min "%~dp0deploy\autostart\ai.cmd"
start "Zoo API server (5000)" /min "%~dp0deploy\autostart\api.cmd"
start "Zoo website (4173)" /min "%~dp0deploy\autostart\web.cmd"
rem Puts the site online at https://manilazoonavigationsystem.com (Cloudflare tunnel)
start "Zoo domain" /min "%~dp0deploy\autostart\domain.cmd"
