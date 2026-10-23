@echo off
title Enable TradeSmart Auto-Start on Windows Boot
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0register_autostart.ps1"
echo.
echo ==================================================================
echo   [SUCCESS] TradeSmart Auto-Start Enabled!
echo ==================================================================
echo   Jab bhi aapka PC on hoga, TradeSmart silently background me
echo   chalna shuru ho jayega.
echo.
echo   Aapko daily koi terminal ya batch file open karne ki zaroorat nahi hai.
echo   Jab bhi trade karna ho, bas Desktop par "TradeSmart" icon par
echo   double-click karein, aur app window turant khul jayegi!
echo ==================================================================
echo.
pause
