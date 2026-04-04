@echo off
title SimpleNOC v0.5.5.1
color 0B
echo.
echo  ==========================================
echo   SimpleNOC v0.5.5.1 - Starting Services
echo  ==========================================
echo.

:: Check Admin
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo  Requesting Administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit
)

:: Find Python
set PYTHON=
for %%P in (
    "C:\Python313\python.exe"
    "C:\Python312\python.exe"
    "C:\Python311\python.exe"
    "C:\Python310\python.exe"
) do (
    if exist %%P (
        %%P --version >nul 2>&1
        if not errorlevel 1 ( set PYTHON=%%P & goto :found )
    )
)
py --version >nul 2>&1
if not errorlevel 1 ( for /f %%i in ('py -c "import sys;print(sys.executable)"') do set PYTHON=%%i & goto :found )

echo  ERROR: Python not found. Install Python 3.10+
pause & exit

:found
echo  Python: %PYTHON%
echo  Directory: %~dp0
echo.

:: Kill any existing instances
taskkill /FI "WindowTitle eq NOC-SNMP*"    /F >nul 2>&1
taskkill /FI "WindowTitle eq NOC-Syslog*"  /F >nul 2>&1
taskkill /FI "WindowTitle eq NOC-API*"     /F >nul 2>&1
timeout /t 1 /nobreak >nul

:: Create logs dir
if not exist "%~dp0logs" mkdir "%~dp0logs"

echo  [1/3] Starting SNMP Trap Receiver...
start "NOC-SNMP" /min cmd /c "cd /d %~dp0 && %PYTHON% trap_receiver.py >> logs\snmp.log 2>&1"
timeout /t 2 /nobreak >nul

echo  [2/3] Starting Syslog Server...
start "NOC-Syslog" /min cmd /c "cd /d %~dp0 && %PYTHON% syslog_server.py >> logs\syslog.log 2>&1"
timeout /t 2 /nobreak >nul

echo  [3/3] Starting API and Dashboard...
start "NOC-API" /min cmd /c "cd /d %~dp0 && %PYTHON% api.py >> logs\api.log 2>&1"
timeout /t 3 /nobreak >nul

echo.
echo  ==========================================
echo   All services started!
echo   Dashboard: https://localhost:5443
echo   Default login: admin / admin123
echo  ==========================================
echo.
echo  Services are running in background.
echo  Close this window or press any key to open dashboard.
echo.
pause >nul
start https://localhost:5443
