@echo off
setlocal EnableExtensions EnableDelayedExpansion
title SimpleNOC v0.5.5.1 - Setup and Maintenance
color 0B

call :ensure_admin
if errorlevel 1 goto :end
call :find_python
if errorlevel 1 goto :end
if not defined PYTHON goto :end

:menu
cls
echo.
echo  ===============================================
echo   SimpleNOC v0.5.5.1 - Setup and Maintenance Tool
echo  ===============================================
echo.
echo   1. Install or Update SimpleNOC
echo   2. Setup PostgreSQL Database
echo   3. Uninstall SimpleNOC
echo   4. Exit
echo.
set /p CHOICE=Select an option [1-4]:

if "%CHOICE%"=="1" goto :install_app
if "%CHOICE%"=="2" goto :setup_postgres
if "%CHOICE%"=="3" goto :uninstall_app
if "%CHOICE%"=="4" goto :end

echo.
echo  Invalid choice.
pause
goto :menu

:install_app
cls
echo.
echo  Installing or updating SimpleNOC...
echo.
"%PYTHON%" "%~dp0setup.py" install
if errorlevel 1 (
    echo.
    echo  Installation returned an error.
    pause
    goto :menu
)
pause
goto :menu

:setup_postgres
cls
echo.
echo  Starting PostgreSQL setup...
echo.
set "SIMPLENOC_NO_PAUSE=1"
call "%~dp0setup_postgres.bat"
set "SIMPLENOC_NO_PAUSE="
if errorlevel 1 (
    echo.
    echo  PostgreSQL setup reported an error.
    pause
    goto :menu
)
pause
goto :menu

:uninstall_app
cls
echo.
echo  Uninstalling SimpleNOC...
echo.
"%PYTHON%" "%~dp0setup.py" uninstall
pause
goto :end

:ensure_admin
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo  Requesting Administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b 1
)
exit /b 0

:find_python
set PYTHON=

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
) do (
    if exist %%~P (
        %%~P --version >nul 2>&1
        if not errorlevel 1 (
            set PYTHON=%%~P
            goto :python_ready
        )
    )
)

py --version >nul 2>&1
if not errorlevel 1 (
    for /f "tokens=*" %%i in ('py -c "import sys; print(sys.executable)"') do set PYTHON=%%i
    if defined PYTHON goto :python_ready
)

for /f "tokens=*" %%i in ('where python 2^>nul') do (
    echo %%i | findstr /i "WindowsApps" >nul
    if errorlevel 1 (
        set PYTHON=%%i
        goto :python_ready
    )
)

echo.
echo  ERROR: Python 3.10+ was not found.
echo  Install Python and re-run this tool.
pause
exit /b 1

:python_ready
echo  Using Python: %PYTHON%
exit /b 0

:end
endlocal
