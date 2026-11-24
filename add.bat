@echo off
cd /d "%~dp0"
chcp 65001 >nul
echo ============================================
echo   WenCaleb add a resource
echo ============================================
node add.js
echo.
pause
