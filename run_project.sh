#!/usr/bin/env bash
# ==============================================================================
# AuraStudy 1-Command Plug & Play Launcher (macOS / Linux / WSL)
# ==============================================================================

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "================================================================"
echo "          AuraStudy Adaptive Study Planner Platform"
echo "================================================================"
echo ""

# 1. Auto Provision .env if missing
if [ ! -f "backend/.env" ]; then
    echo "[SETUP] backend/.env missing. Creating from template..."
    cp backend/.env.example backend/.env
    echo "[OK] backend/.env created."
fi

# 2. Python Virtual Environment Check
if [ ! -f "backend/venv/bin/python" ]; then
    echo "[SETUP] Creating Python virtual environment..."
    python3 -m venv backend/venv
    echo "[SETUP] Installing Python requirements..."
    backend/venv/bin/pip install --upgrade pip --quiet
    backend/venv/bin/pip install -r backend/requirements.txt
    echo "[OK] Python environment ready."
fi

# 3. Node Modules Check
if [ ! -d "frontend/node_modules" ]; then
    echo "[SETUP] Installing Node dependencies..."
    (cd frontend && npm install)
    echo "[OK] Frontend node_modules ready."
fi

# 4. Start Services
echo ""
echo "[1/2] Starting FastAPI Backend on http://127.0.0.1:8001 ..."
(cd backend && ./venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload) &
BACKEND_PID=$!

echo "[2/2] Starting React Frontend on http://localhost:3000 ..."
(cd frontend && npm run dev) &
FRONTEND_PID=$!

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" SIGINT SIGTERM

echo ""
echo "Waiting for services to initialize..."
sleep 4

echo ""
echo "================================================================"
echo "  AuraStudy is running!"
echo "  Web App : http://localhost:3000"
echo "  API Docs: http://127.0.0.1:8001/docs"
echo "================================================================"
echo "Press Ctrl+C to stop all services."

# Attempt browser launch
if command -v xdg-open > /dev/null; then
    xdg-open http://localhost:3000
elif command -v open > /dev/null; then
    open http://localhost:3000
fi

wait
