@echo off
title SimpleNOC v0.5.6.0 - Installer
color 0B
echo.
echo  ==========================================
echo   Simple NOC v0.5.6.0 - Installation
echo  ==========================================
echo.

:: Check for Admin
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo  Requesting Administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit
)
echo  Running as Administrator - OK
echo.

:: ── Find REAL Python (skip Microsoft Store stub) ─────────────────────────────
set PYTHON=

:: Check common install locations first
for %%P in (
    "C:\Python313\python.exe"
    "C:\Python312\python.exe"
    "C:\Python311\python.exe"
    "C:\Python310\python.exe"
    "C:\Python39\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python310\python.exe"
    "%PROGRAMFILES%\Python313\python.exe"
    "%PROGRAMFILES%\Python312\python.exe"
    "%PROGRAMFILES%\Python311\python.exe"
    "%PROGRAMFILES%\Python310\python.exe"
    "C:\Users\Smartgem Tech\AppData\Local\Programs\Python\Python313\python.exe"
    "C:\Users\Smartgem Tech\AppData\Local\Programs\Python\Python312\python.exe"
    "C:\Users\Smartgem Tech\AppData\Local\Programs\Python\Python311\python.exe"
) do (
    if exist %%P (
        :: Make sure it's not the Windows Store stub
        %%P --version >nul 2>&1
        if not errorlevel 1 (
            set PYTHON=%%P
            goto :found_python
        )
    )
)

:: Try py launcher
py --version >nul 2>&1
if not errorlevel 1 (
    for /f "tokens=*" %%i in ('py -c "import sys; print(sys.executable)"') do set PYTHON=%%i
    if defined PYTHON goto :found_python
)

:: Try python3
python3 --version >nul 2>&1
if not errorlevel 1 (
    for /f "tokens=*" %%i in ('where python3') do (
        echo %%i | findstr /i "WindowsApps" >nul
        if errorlevel 1 (
            set PYTHON=%%i
            goto :found_python
        )
    )
)

:: Last resort - try python but skip WindowsApps
for /f "tokens=*" %%i in ('where python 2^>nul') do (
    echo %%i | findstr /i "WindowsApps" >nul
    if errorlevel 1 (
        set PYTHON=%%i
        goto :found_python
    )
)

:: Nothing found
echo  ERROR: Real Python installation not found!
echo.
echo  The Microsoft Store Python stub was detected but is not usable.
echo.
echo  Please install Python from: https://www.python.org/downloads/
echo  During install: CHECK "Add Python to PATH"
echo                  CHECK "Install for all users"
echo.
echo  Then re-run this installer.
pause
exit

:found_python
echo  Python found: %PYTHON%

:: Verify it actually works
%PYTHON% --version
if errorlevel 1 (
    echo  ERROR: Python found but not working. Please reinstall Python.
    pause
    exit
)

echo.
echo  Starting SimpleNOC installation...
echo.
%PYTHON% "%~dp0setup.py"

pause
