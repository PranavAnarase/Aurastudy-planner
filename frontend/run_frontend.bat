@echo off
title AuraStudy Frontend (Port 3000)
cd /d "%~dp0"

echo ===================================================
echo  AuraStudy React Frontend - Port 3000
echo ===================================================
echo.

REM --- Check node_modules ---
if not exist "%~dp0node_modules" (
    echo [INFO] node_modules not found. Installing dependencies...
    echo.
    npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed. Make sure Node.js is installed.
        pause
        exit /b 1
    )
    echo.
)

echo [OK] Starting Vite dev server on http://localhost:3000
echo.

npm run dev

if errorlevel 1 (
    echo.
    echo [ERROR] Frontend crashed or failed to start.
    echo         Check the error above for details.
    pause
)
