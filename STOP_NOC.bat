@echo off
title Smart NOC - Stop
echo Stopping Smart NOC v0.5.6.4...
taskkill /FI "WindowTitle eq NOC-SNMP*"   /F >nul 2>&1
taskkill /FI "WindowTitle eq NOC-Syslog*" /F >nul 2>&1
taskkill /FI "WindowTitle eq NOC-API*"    /F >nul 2>&1
echo Done. All services stopped.
timeout /t 2 /nobreak >nul
