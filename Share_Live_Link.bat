@echo off
title TradeSmart - Share Live Link
cd /d "%~dp0"
python share_link.py
if errorlevel 1 (
    echo.
    echo An error occurred.
    pause
)
