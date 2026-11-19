@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Please install Node.js 18 or later.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [1/2] First run, installing dependencies. This may take a few minutes...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed. Check your network and retry.
    pause
    exit /b 1
  )
)

echo [2/2] Starting dev server at http://localhost:3000
echo Close this window to stop the server.
call npm run dev -- --open

pause
