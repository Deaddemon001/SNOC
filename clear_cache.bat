@echo off
echo Clearing Python cache from SimpleNOC...
if exist "C:\SimpleNOC\__pycache__" (
    rmdir /S /Q "C:\SimpleNOC\__pycache__"
    echo Cleared: C:\SimpleNOC\__pycache__
) else (
    echo No cache found.
)
echo Done. Restart SimpleNOC now.
pause
