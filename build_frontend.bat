@echo off
title Build TradeSmart Frontend
cd /d "%~dp0"

set "NODE_PATH=%LOCALAPPDATA%\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.20.0-win-x64"
if exist "%NODE_PATH%" set "PATH=%NODE_PATH%;%PATH%"

echo Building TradeSmart React SPA frontend...
call npm run build

if %ERRORLEVEL% equ 0 (
    echo.
    echo [SUCCESS] Frontend built successfully into 'dist/' folder!
) else (
    echo.
    echo [ERROR] Frontend build failed!
)
pause
