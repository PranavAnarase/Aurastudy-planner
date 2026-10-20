# 🎓 AuraStudy — AI-Adaptive Personalized Study Planner

A state-of-the-art educational platform featuring an AI-adaptive diagnostic engine, dynamic study block optimization, and personalized daily and weekly learning schedules.

---

## ⚡ Quick Start (Plug and Play)

No complex configuration needed. Anyone with access can get started in seconds:

### 🪟 Windows (1-Click)
Simply **double-click** the root launcher file:
```cmd
run_project.bat
```
*The script will automatically provision your `.env`, create the Python virtual environment, install backend & frontend dependencies, start both servers, and launch your browser.*

### 🍎 macOS / Linux (1-Command)
```bash
chmod +x run_project.sh
./run_project.sh
```

### 🐳 Docker Compose
If you prefer running inside containers:
```bash
docker compose up --build
```

---

## 🌐 Application URLs

Once running, the services are available at:

| Service | URL | Description |
| :--- | :--- | :--- |
| **Web Application** | [http://localhost:3000](http://localhost:3000) | React + TypeScript Interactive Interface |
| **FastAPI Swagger Docs** | [http://127.0.0.1:8001/docs](http://127.0.0.1:8001/docs) | Interactive API exploration & test runner |
| **Alternative API Specs** | [http://127.0.0.1:8001/redoc](http://127.0.0.1:8001/redoc) | ReDoc formatted API specifications |

---

## 🛠️ Architecture & Tech Stack

```
aurastudy-planner/
├── backend/
│   ├── alembic/                 # Database migrations
│   ├── app/                     # Core FastAPI application
│   │   ├── assessment/          # AI-powered chapter assessments & insights
│   │   ├── diagnostic/          # 49-question adaptive diagnostic engine
│   │   ├── onboarding/          # Student & parent onboarding
│   │   ├── parent/              # Parent portal & progress tracking
│   │   ├── planner/             # Knapsack & greedy daily/weekly scheduler
│   │   ├── progress/            # Mastery analytics & syllabus pipeline
│   │   ├── config.py            # Environment-backed configuration
│   │   └── main.py              # Application entry point
│   ├── tests/                   # Automated test suite
│   ├── .env.example             # Environment configuration template
│   ├── requirements.txt         # Python dependencies
│   └── run_backend.bat          # Standalone backend runner
├── frontend/
│   ├── src/                     # React + TypeScript client
│   │   ├── components/          # Dashboards, Assessments, Modals
│   │   ├── config/api.ts        # Centralized API service locator
│   │   └── App.tsx              # Root application router
│   ├── package.json             # NPM dependencies
│   └── run_frontend.bat         # Standalone frontend runner
├── database/                    # Database schema and seed data
├── docker-compose.yml           # Full-stack container orchestration
├── run_project.bat              # Universal 1-Click launcher (Windows)
├── run_project.sh               # Universal 1-Command launcher (Unix)
└── README.md
```

### Core Technologies
- **Backend**: Python 3.11+, FastAPI, SQLAlchemy AsyncIO, Uvicorn, Pydantic v2
- **Frontend**: React 18, TypeScript, Vite, TailwindCSS, Lucide React
- **AI Intelligence**: Groq Cloud AI Engine for diagnostic feedback and learning insights
- **Containerization**: Docker & Docker Compose

---

## ⚙️ Environment Configuration

Environment settings are managed through `backend/.env`. A template is provided at `backend/.env.example`:

```env
# Database Connection URL (MySQL / PostgreSQL / SQLite)
DATABASE_URL=mysql+aiomysql://username:password@localhost:3306/new_study_planner

# Groq Cloud API Key for AI Insights & Diagnostics
GROQ_API_KEY=your_groq_api_key_here

# Backend Server Configuration
HOST=127.0.0.1
PORT=8001
```

> **Note**: `backend/.env` is strictly excluded from version control for privacy and security.

---

## 🧪 Testing & Verification

Run automated test suites directly with:

```bash
# Backend Tests
cd backend
python -m pytest tests/

# Frontend Type Check & Build
cd frontend
npm run build
```
