@echo off
echo Smart NOC v0.6.0 Status
echo =======================
tasklist /FI "WindowTitle eq NOC-*" 2>nul | find /I "cmd.exe" >nul
if %errorLevel%==0 (echo  Services: RUNNING) else (echo  Services: STOPPED)
echo  Dashboard: https://localhost:5443
echo.
pause
