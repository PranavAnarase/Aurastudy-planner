"""
FastAPI router for parent registration, login, and read-only dashboard aggregation.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.database import get_db
from app.parent.models import (
    ParentRegisterRequest,
    ParentLoginRequest,
    ParentAuthResponse,
    ParentDashboardResponse,
)
from app.parent.repository import ParentRepository, verify_password

router = APIRouter(prefix="/parent", tags=["Parent Portal"])


@router.post("/register", response_model=ParentAuthResponse, status_code=status.HTTP_201_CREATED)
async def register_parent(
    request: ParentRegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    repo = ParentRepository(db)

    # 1. Check if parent username already taken
    existing_parent = await repo.get_parent_by_username(request.username)
    if existing_parent:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Parent username '{request.username}' is already in use. Please choose another.",
        )

    # 2. Check if student username exists in student profile table
    student = await repo.get_student_by_username(request.student_username)
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Student with username '{request.student_username}' was not found. Please verify child's username.",
        )

    # 3. Create isolated parent record
    parent = await repo.create_parent(
        full_name=request.full_name,
        username=request.username,
        password=request.password,
        student_username=request.student_username,
    )

    child_name = f"{student.first_name} {student.last_name}".strip()

    return ParentAuthResponse(
        parent_id=parent.id,
        username=parent.username,
        full_name=parent.full_name,
        student_username=parent.student_username,
        student_id=student.student_id,
        student_name=child_name,
    )


@router.post("/login", response_model=ParentAuthResponse)
async def login_parent(
    request: ParentLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    repo = ParentRepository(db)

    # 1. Find parent by username
    parent = await repo.get_parent_by_username(request.username)
    if not parent or not verify_password(request.password, parent.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid parent username or password.",
        )

    # 2. Resolve child profile
    student = await repo.get_student_by_username(parent.student_username)
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Linked student account '{parent.student_username}' was not found.",
        )

    child_name = f"{student.first_name} {student.last_name}".strip()

    return ParentAuthResponse(
        parent_id=parent.id,
        username=parent.username,
        full_name=parent.full_name,
        student_username=parent.student_username,
        student_id=student.student_id,
        student_name=child_name,
    )


@router.get("/dashboard-data", response_model=ParentDashboardResponse)
async def get_parent_dashboard(
    parent_id: Optional[str] = Query(None),
    parent_username: Optional[str] = Query(None),
    student_username: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    repo = ParentRepository(db)

    parent = None
    if parent_id:
        parent = await repo.get_parent_by_id(parent_id)
    elif parent_username:
        parent = await repo.get_parent_by_username(parent_username)

    if not parent and student_username:
        # Fallback query if parent session is indexed by linked student
        student = await repo.get_student_by_username(student_username)
        if not student:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Student '{student_username}' not found.",
            )
        # Mock a parent wrapper if requested directly by student username
        from app.models.parent import Parent
        parent = Parent(
            id="parent-session",
            username=f"parent_{student.username}",
            password_hash="",
            full_name=f"Parent of {student.first_name}",
            student_username=student.username,
        )

    if not parent:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Must provide parent_id, parent_username, or student_username to fetch parent dashboard data.",
        )

    try:
        data = await repo.get_dashboard_data(parent)
        return data
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load parent dashboard: {str(e)}",
        )


# In-memory High-Five notification store
import uuid
from datetime import datetime
from app.parent.models import SendHighFiveRequest, HighFiveItem
from typing import List

_HIGH_FIVES_STORE: List[dict] = []


@router.post("/send-high-five", response_model=HighFiveItem)
async def send_high_five(
    request: SendHighFiveRequest,
    db: AsyncSession = Depends(get_db),
):
    item = {
        "id": str(uuid.uuid4()),
        "student_username": request.student_username.strip(),
        "sender_name": request.sender_name.strip(),
        "message": request.message or "Keep up the fantastic momentum! Super proud of your discipline tonight.",
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "acknowledged": False,
    }
    _HIGH_FIVES_STORE.append(item)
    return HighFiveItem(**item)


@router.get("/high-fives", response_model=List[HighFiveItem])
async def get_high_fives(
    user_id: Optional[int] = Query(None, description="Student/User ID"),
    student_username: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    student_id = user_id
    repo = ParentRepository(db)
    resolved_username = student_username

    if not resolved_username and student_id:
        student = await repo.get_student_by_id(student_id)
        if student:
            resolved_username = student.username

    if not resolved_username:
        return []

    # Return unacknowledged or recent high fives for this student
    pending = [
        HighFiveItem(**item)
        for item in _HIGH_FIVES_STORE
        if item["student_username"].lower() == resolved_username.lower() and not item.get("acknowledged", False)
    ]
    return pending


@router.post("/ack-high-five/{high_five_id}")
async def acknowledge_high_five(high_five_id: str):
    for item in _HIGH_FIVES_STORE:
        if item["id"] == high_five_id:
            item["acknowledged"] = True
            return {"status": "success", "message": "High-five acknowledged"}
    return {"status": "not_found", "message": "High-five not found"}



