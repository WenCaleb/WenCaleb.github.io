@echo off
cd /d "%~dp0"
echo ============================================
echo   WenCaleb site build
echo ============================================
node build.js
if errorlevel 1 (
  echo.
  echo Build FAILED.
) else (
  echo.
  echo Build OK. You can push now ^(or ask WorkBuddy to push^).
)
echo.
pause
