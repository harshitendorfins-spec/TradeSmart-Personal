@echo off
title Stop TradeSmart
echo Stopping TradeSmart processes on port 8000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr /r ":8000.*LISTENING"') do (
    taskkill /f /pid %%a 2>nul
)
echo TradeSmart stopped.
ping -n 2 127.0.0.1 >nul
