@echo off
echo SimpleNOC v0.5.5.1 Status
echo ========================
tasklist /FI "WindowTitle eq SimpleNOC*" 2>nul | find /I "cmd.exe" >nul
if %errorLevel%==0 (echo  Services: RUNNING) else (echo  Services: STOPPED)
echo  Dashboard: http://localhost:5000
echo.
pause
