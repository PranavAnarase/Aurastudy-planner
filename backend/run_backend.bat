@echo off
title AuraStudy Backend (Port 8001)
cd /d "%~dp0"

echo ===================================================
echo  AuraStudy FastAPI Backend - Port 8001
echo  Database: Connected via environment configuration
echo ===================================================
echo.

REM --- Locate Python from venv ---
set "VENV_PYTHON=%~dp0venv\Scripts\python.exe"

if not exist "%VENV_PYTHON%" (
    echo [ERROR] Virtual environment not found.
    echo         Please run run_project.bat first to set up the environment.
    echo.
    pause
    exit /b 1
)

REM --- Verify the venv Python actually works ---
"%VENV_PYTHON%" --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Virtual environment is broken - Python interpreter missing.
    echo         Please run run_project.bat to rebuild it.
    echo.
    pause
    exit /b 1
)

echo [OK] Using venv Python: %VENV_PYTHON%
echo.
echo  Starting server... (Ctrl+C to stop)
echo.

set "PYTHONPATH=%~dp0"
"%VENV_PYTHON%" -m uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload

if errorlevel 1 (
    echo.
    echo [ERROR] Backend crashed or failed to start.
    echo         Check the error above for details.
    pause
)
