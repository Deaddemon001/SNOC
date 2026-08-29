@echo off
echo Clearing Python cache from Smart NOC...
if exist "C:\SmartNOC\__pycache__" (
    rmdir /S /Q "C:\SmartNOC\__pycache__"
    echo Cleared: C:\SmartNOC\__pycache__
) else (
    echo No cache found.
)
echo Done. Restart Smart NOC now.
pause
