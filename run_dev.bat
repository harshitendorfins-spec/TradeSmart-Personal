@echo off
title TradeSmart [Dev Mode - Hot Reload]
cd /d "%~dp0"

set "NODE_PATH=%LOCALAPPDATA%\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.20.0-win-x64"
if exist "%NODE_PATH%" set "PATH=%NODE_PATH%;%PATH%"

echo ==============================================================
echo     Starting TradeSmart in Developer Hot-Reload Mode
echo ==============================================================
echo  - Backend API: http://127.0.0.1:8000
echo  - Frontend Vite Dev Server: http://localhost:3000
echo ==============================================================

start "TradeSmart FastAPI Backend" cmd /k "python app.py"
start "TradeSmart Vite Dev Server" cmd /k "npm run dev"

ping -n 4 127.0.0.1 >nul
start http://localhost:3000
