@echo off
echo Removing Smart NOC scheduled tasks...
schtasks /Delete /TN "SmartNOC-API"     /F >nul 2>&1
schtasks /Delete /TN "SmartNOC-SNMP"    /F >nul 2>&1
schtasks /Delete /TN "SmartNOC-Syslog"  /F >nul 2>&1
schtasks /Delete /TN "SimpleNOC-API"    /F >nul 2>&1
schtasks /Delete /TN "SimpleNOC-SNMP"   /F >nul 2>&1
schtasks /Delete /TN "SimpleNOC-Syslog" /F >nul 2>&1
echo Done. Scheduled tasks removed.
echo Launcher.pyw will manage all services instead.
pause
