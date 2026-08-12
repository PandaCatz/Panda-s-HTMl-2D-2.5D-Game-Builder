@echo off
setlocal
cd /d "%~dp0"

where node.exe >nul 2>nul
if errorlevel 1 (
  echo LoopLab requires Node.js 22.13 or newer.
  echo Install Node.js, then double-click this launcher again.
  pause
  exit /b 1
)

if not exist "node_modules\vinext\dist\cli.js" (
  echo LoopLab dependencies are not installed yet.
  echo Open a terminal in this folder once and run: npm install
  pause
  exit /b 1
)

echo Starting LoopLab and its managed AI companion...
echo The editor will open automatically when it is ready.
call npm run open

if errorlevel 1 (
  echo.
  echo LoopLab stopped with an error. Review the messages above.
  pause
)
