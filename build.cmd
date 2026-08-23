@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js LTS x64 first
  echo https://nodejs.org/
  pause
  exit /b 1
)

call npm install
if errorlevel 1 exit /b 1

call npm run build
if errorlevel 1 exit /b 1

echo.
echo Build completed
echo CodexDesk Setup is ready
start "" "%~dp0release"
pause
