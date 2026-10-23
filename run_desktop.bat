@echo off
title TradeSmart
cd /d "%~dp0"

:: Ensure Node and Python in PATH
set "NODE_PATH=%LOCALAPPDATA%\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.20.0-win-x64"
if exist "%NODE_PATH%" set "PATH=%NODE_PATH%;%PATH%"

python launcher.py --app-mode
