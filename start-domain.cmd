@echo off
rem Puts the site on this laptop online at https://manilazoonavigationsystem.com.
rem Run start-zoo.cmd first (or let it auto-start), then this. It also starts automatically at sign-in.
rem The site stays online while this window is open and the laptop is on, awake and connected.
start "Zoo domain" /min "%~dp0deploy\autostart\domain.cmd"
echo Connecting... in a few seconds the site opens at https://manilazoonavigationsystem.com
