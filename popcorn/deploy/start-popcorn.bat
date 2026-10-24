@echo off
REM Starts Popcorn on Windows. Put a shortcut to this file in shell:startup to run it at login.
cd /d "%~dp0..\server"
node src\index.js
pause
