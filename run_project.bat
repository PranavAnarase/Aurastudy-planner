@echo off
setlocal enabledelayedexpansion
title AuraStudy Platform Launcher
cls
color 0B

echo ================================================================
echo           AuraStudy Adaptive Study Planner Platform
echo ================================================================
echo.

REM -- Dynamic root directory determination --
set "BASE_DIR=%~dp0"
if "!BASE_DIR:~-1!"=="\" set "BASE_DIR=!BASE_DIR:~0,-1!"
set "BACKEND=!BASE_DIR!\backend"
set "FRONTEND=!BASE_DIR!\frontend"
set "VENV_PY=!BACKEND!\venv\Scripts\python.exe"

REM ----------------------------------------------------------------
REM  PRE-FLIGHT CHECKS
REM ----------------------------------------------------------------
echo [CHECK] Verifying project core directories...

if not exist "!BACKEND!\app\main.py" (
    echo [ERROR] Backend not found at: !BACKEND!\app\main.py
    pause
    exit /b 1
)
if not exist "!FRONTEND!\package.json" (
    echo [ERROR] Frontend not found at: !FRONTEND!\package.json
    pause
    exit /b 1
)
echo [OK] Core project files located.

REM ----------------------------------------------------------------
REM  ENVIRONMENT FILE CHECK (Plug & Play Auto-Provisioning)
REM ----------------------------------------------------------------
if not exist "!BACKEND!\.env" (
    echo [SETUP] No .env file found in backend.
    if exist "!BACKEND!\.env.example" (
        echo [SETUP] Auto-creating backend\.env from template...
        copy "!BACKEND!\.env.example" "!BACKEND!\.env" >nul
        echo [OK] backend\.env created with default parameters.
    ) else (
        echo [WARNING] .env.example not found. Using defaults.
    )
)

REM ----------------------------------------------------------------
REM  CHECK PYTHON VIRTUAL ENVIRONMENT
REM ----------------------------------------------------------------
set "VENV_GOOD=0"
if exist "!VENV_PY!" (
    "!VENV_PY!" --version >nul 2>&1
    if !errorlevel! == 0 set "VENV_GOOD=1"
)

if "!VENV_GOOD!" == "1" goto :venv_ok

echo.
echo [SETUP] Python virtual environment missing or broken. Rebuilding...
echo         This only happens on initial setup and takes 1-2 minutes.
echo.

if exist "!BACKEND!\venv" (
    echo [SETUP] Removing broken venv...
    rmdir /s /q "!BACKEND!\venv"
)

REM Locate available Python interpreter
set "FOUND_PY="
if exist "C:\Python313\python.exe" set "FOUND_PY=C:\Python313\python.exe"
if not defined FOUND_PY (
    if exist "C:\Python312\python.exe" set "FOUND_PY=C:\Python312\python.exe"
)
if not defined FOUND_PY (
    if exist "C:\Python314\python.exe" set "FOUND_PY=C:\Python314\python.exe"
)
if not defined FOUND_PY (
    py -3.13 --version >nul 2>&1
    if !errorlevel! == 0 set "FOUND_PY=py -3.13"
)
if not defined FOUND_PY (
    py -3 --version >nul 2>&1
    if !errorlevel! == 0 set "FOUND_PY=py -3"
)
if not defined FOUND_PY (
    python --version >nul 2>&1
    if !errorlevel! == 0 set "FOUND_PY=python"
)

if not defined FOUND_PY (
    echo.
    echo [ERROR] Python 3 was not detected on this system.
    echo         Please install Python 3.11+ from https://www.python.org/
    pause
    exit /b 1
)

echo [SETUP] Creating virtual environment using: !FOUND_PY! ...
!FOUND_PY! -m venv "!BACKEND!\venv"

if not exist "!VENV_PY!" (
    echo.
    echo [ERROR] Failed to create virtual environment.
    pause
    exit /b 1
)

echo [SETUP] Upgrading pip...
"!VENV_PY!" -m pip install --upgrade pip --quiet

echo [SETUP] Installing backend Python packages...
"!VENV_PY!" -m pip install -r "!BACKEND!\requirements.txt"
if errorlevel 1 (
    echo.
    echo [ERROR] Package installation failed. Check your internet connection.
    pause
    exit /b 1
)
echo [OK] Python environment ready.
echo.

:venv_ok
echo [OK] Python virtual environment verified.

REM ----------------------------------------------------------------
REM  CHECK FRONTEND NODE MODULES
REM ----------------------------------------------------------------
if not exist "!FRONTEND!\node_modules" (
    echo.
    echo [SETUP] Frontend node_modules missing. Running npm install...
    pushd "!FRONTEND!"
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed. Make sure Node.js is installed from https://nodejs.org/
        popd
        pause
        exit /b 1
    )
    popd
    echo [OK] Node modules successfully installed.
    echo.
) else (
    echo [OK] Frontend node_modules verified.
)

echo.
echo ================================================================
echo  All checks passed! Starting AuraStudy services...
echo ================================================================
echo.

REM ----------------------------------------------------------------
REM  START BACKEND in a new window
REM ----------------------------------------------------------------
echo [1/2] Starting FastAPI Backend on http://127.0.0.1:8001 ...
if exist "!BACKEND!\run_backend.bat" (
    start "AuraStudy Backend" cmd /k "cd /d ""!BACKEND!"" && call run_backend.bat"
) else (
    start "AuraStudy Backend" cmd /k "cd /d ""!BACKEND!"" && set ""PYTHONPATH=!BACKEND!"" && ""!VENV_PY!"" -m uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload"
)

echo       Waiting 6 seconds for backend initialization...
ping 127.0.0.1 -n 7 >nul

REM ----------------------------------------------------------------
REM  START FRONTEND in a new window
REM ----------------------------------------------------------------
echo [2/2] Starting React Frontend on http://localhost:3000 ...
if exist "!FRONTEND!\run_frontend.bat" (
    start "AuraStudy Frontend" cmd /k "cd /d ""!FRONTEND!"" && call run_frontend.bat"
) else (
    start "AuraStudy Frontend" cmd /k "cd /d ""!FRONTEND!"" && npm run dev"
)

echo       Waiting 4 seconds for Vite server...
ping 127.0.0.1 -n 5 >nul

REM ----------------------------------------------------------------
REM  APP READY & BROWSER LAUNCH
REM ----------------------------------------------------------------
echo.
echo ================================================================
echo   AuraStudy is up and running!
echo   --------------------------------------------------------
echo   Web App  :  http://localhost:3000
echo   API Docs :  http://127.0.0.1:8001/docs
echo ================================================================
echo.
echo  Opening browser...
start http://localhost:3000

echo.
echo  This launcher window can remain open or be closed.
echo  To stop the application, simply close the Backend and Frontend windows.
echo.
pause >nul
endlocal
exit /b 0
