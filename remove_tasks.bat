@echo off
echo Removing SimpleNOC scheduled tasks...
schtasks /Delete /TN "SimpleNOC-API"    /F >nul 2>&1
schtasks /Delete /TN "SimpleNOC-SNMP"   /F >nul 2>&1
schtasks /Delete /TN "SimpleNOC-Syslog" /F >nul 2>&1
echo Done. Scheduled tasks removed.
echo Launcher.pyw will manage all services instead.
pause
