@echo off
setlocal EnableExtensions EnableDelayedExpansion
title SimpleNOC v0.5.6.0 - PostgreSQL Setup
color 0B
echo.
echo  ==========================================
echo   Simple NOC v0.5.6.0 - PostgreSQL DB Setup
echo  ==========================================
echo.
echo  This script creates:
echo    Database : simplenoc
echo    App user : adminsql
echo    App password : hidden
echo    Default app login uses username = password
echo.

call :find_psql
if errorlevel 1 (
    if not defined SIMPLENOC_NO_PAUSE pause
    exit /b 1
)

set /p PGADMIN=Enter PostgreSQL superuser name [postgres]: 
if "%PGADMIN%"=="" set "PGADMIN=postgres"

echo.
echo  Connecting as '%PGADMIN%' to initialize SimpleNOC...
echo  You may be prompted for the PostgreSQL superuser password.
echo.

psql -U "%PGADMIN%" -f "%~dp0init_postgres.sql"

if %errorLevel% equ 0 (
    echo.
    echo  [SUCCESS] SimpleNOC database and 'adminsql' user initialized.
    echo  [INFO] App database credentials: username 'adminsql' with matching password.
    set "EXITCODE=0"
) else (
    echo.
    echo  [ERROR] Database initialization failed. Please check the output above.
    set "EXITCODE=1"
)

echo.
if not defined SIMPLENOC_NO_PAUSE pause
exit /b %EXITCODE%

:find_psql
set "PSQL_EXE="

for /f "delims=" %%i in ('where psql 2^>nul') do (
    if exist "%%~fi" (
        set "PSQL_EXE=%%~fi"
        goto :psql_found
    )
)

for %%P in (
    "C:\Program Files\PostgreSQL\18\bin\psql.exe"
    "C:\Program Files\PostgreSQL\17\bin\psql.exe"
    "C:\Program Files\PostgreSQL\16\bin\psql.exe"
    "C:\Program Files\PostgreSQL\15\bin\psql.exe"
    "C:\Program Files\PostgreSQL\14\bin\psql.exe"
    "C:\Program Files\PostgreSQL\13\bin\psql.exe"
    "C:\Program Files\PostgreSQL\12\bin\psql.exe"
    "C:\Program Files (x86)\PostgreSQL\18\bin\psql.exe"
    "C:\Program Files (x86)\PostgreSQL\17\bin\psql.exe"
    "C:\Program Files (x86)\PostgreSQL\16\bin\psql.exe"
    "C:\Program Files (x86)\PostgreSQL\15\bin\psql.exe"
    "C:\Program Files (x86)\PostgreSQL\14\bin\psql.exe"
    "C:\Program Files (x86)\PostgreSQL\13\bin\psql.exe"
    "C:\Program Files (x86)\PostgreSQL\12\bin\psql.exe"
) do (
    if exist %%~P (
        set "PSQL_EXE=%%~P"
        goto :psql_found
    )
)

for %%D in ("%ProgramFiles%\PostgreSQL" "%ProgramFiles(x86)%\PostgreSQL") do (
    if exist "%%~D" (
        for /f "delims=" %%i in ('dir /b /ad "%%~D" 2^>nul ^| sort /R') do (
            if exist "%%~D\%%i\bin\psql.exe" (
                set "PSQL_EXE=%%~D\%%i\bin\psql.exe"
                goto :psql_found
            )
        )
    )
)

echo  ERROR: 'psql' was not found automatically.
echo  PostgreSQL may not be installed, or its bin folder is not in a standard location.
echo  Example path: C:\Program Files\PostgreSQL\16\bin
echo.
set /p PGPATH=Enter your PostgreSQL bin folder: 
if not exist "!PGPATH!\psql.exe" (
    echo  ERROR: psql.exe not found in !PGPATH!
    exit /b 1
)
set "PSQL_EXE=!PGPATH!\psql.exe"
goto :psql_found

:psql_found
for %%i in ("!PSQL_EXE!") do set "PSQL_BIN=%%~dpi"
set "PATH=%PATH%;!PSQL_BIN!"
echo  PostgreSQL client found: !PSQL_EXE!
exit /b 0
