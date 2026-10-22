@echo off
cd /d "%~dp0"
echo ============================================
echo   WenCaleb site build + deploy
echo ============================================
node build.js
if errorlevel 1 (
  echo.
  echo Build FAILED, deploy cancelled.
  pause
  exit /b 1
)
git add -A
git commit -m "Update recite content (auto build)"
git push origin main
if errorlevel 1 (
  echo.
  echo Push FAILED. Check your network or push manually.
) else (
  echo.
  echo Deployed. GitHub Pages will update in a few minutes.
)
echo.
pause
