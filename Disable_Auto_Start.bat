@echo off
title Disable TradeSmart Auto-Start
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -Command "& {
    $startupFolder = [System.Environment]::GetFolderPath('Startup')
    $shortcutPath = Join-Path $startupFolder 'TradeSmart_Service.lnk'
    if (Test-Path $shortcutPath) {
        Remove-Item $shortcutPath -Force
        Write-Host 'TradeSmart removed from Windows Startup.'
    } else {
        Write-Host 'TradeSmart is not currently in Windows Startup.'
    }
}"

echo.
echo ==================================================================
echo   [SUCCESS] TradeSmart Auto-Start Disabled.
echo ==================================================================
pause
