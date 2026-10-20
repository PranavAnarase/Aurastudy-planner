"""
AuraStudy API — Version 1 Central Router

Mounts all feature routers under /api/v1/aurastudy prefix.
Each feature router retains its own sub-prefix (e.g. /onboarding, /assessment).
"""

from fastapi import APIRouter

from app.onboarding.router import router as onboarding_router
from app.diagnostic.router import router as diagnostic_router
from app.progress.router import router as progress_router
from app.planner.router import router as planner_router
from app.parent.router import router as parent_router
from app.assessment.router import router as assessment_router
from app.assessment.router import v1_router as assessment_v1_router

aurastudy_v1_router = APIRouter(prefix="/api/v1/aurastudy")

# Mount feature routers — each already has its own prefix (/onboarding, /diagnostic, etc.)
aurastudy_v1_router.include_router(onboarding_router)
aurastudy_v1_router.include_router(diagnostic_router)
aurastudy_v1_router.include_router(progress_router)
aurastudy_v1_router.include_router(planner_router)
aurastudy_v1_router.include_router(parent_router)

# Assessment main router (POST/PUT/etc. endpoints, keeps its own /assessment prefix)
aurastudy_v1_router.include_router(assessment_router)

# Assessment V1 GET endpoints use query params instead of path params
aurastudy_v1_router.include_router(
    assessment_v1_router,
    prefix="/assessment",
    tags=["Assessment & Dynamic Timetable — V1"],
)
