"""
Planner Router — FastAPI endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date, timedelta
from typing import Optional

from app.database import get_db
from app.progress.repository import ProgressRepository
from app.progress.tracker import ProgressTracker
from .models import (
    GenerateDailyPlanRequest, DailyPlanResponse, TaskModel,
    PatchTaskRequest, PatchTaskResponse,
    GenerateWeeklyPlanRequest, WeeklyPlanResponse, WeeklyDayPlanModel, WeeklyDayTaskModel,
    CommitmentsResponse, UpdateCommitmentsRequest,
    GenerateDynamicSlotsRequest, GenerateDynamicSlotsResponse, DynamicSlotModel
)
from .repository import PlannerRepository
from .task_completion import resolve_carry_forward_candidates
from .weekly_planner import WeeklyPlanner
from .gap_scheduler import (
    generate_adaptive_test_slots,
    time_str_to_minutes,
    rank_topics_by_urgency
)

router = APIRouter(prefix="/planner", tags=["Planner"])


def get_default_start_time(slot: str) -> str:
    slot_upper = slot.upper() if slot else ""
    if "MORNING" in slot_upper:
        return "08:00"
    elif "AFTERNOON" in slot_upper:
        return "14:00"
    elif "EVENING" in slot_upper:
        return "18:00"
    elif "NIGHT" in slot_upper:
        return "21:00"
    return "09:00"


def format_time_slot(start_time_str: str, duration_minutes: int):
    from datetime import datetime, timedelta
    try:
        dt = datetime.strptime(start_time_str, "%H:%M")
    except ValueError:
        try:
            dt = datetime.strptime(start_time_str, "%I:%M %p")
        except ValueError:
            dt = datetime.strptime("09:00", "%H:%M")
            
    end_dt = dt + timedelta(minutes=duration_minutes)
    return dt.strftime("%I:%M %p"), end_dt.strftime("%I:%M %p"), end_dt.strftime("%H:%M")


def get_subject_section(subj_name: str) -> str:
    name_lower = subj_name.lower()
    if "math" in name_lower:
        return "mathematics"
    elif "science" in name_lower or "environmental studies part 1" in name_lower:
        return "science"
    elif "english" in name_lower:
        return "english"
    elif "history" in name_lower or "civics" in name_lower or "environmental studies part 2" in name_lower:
        return "history and civics"
    elif "geography" in name_lower:
        return "geography"
    elif "hindi" in name_lower:
        return "hindi"
    elif "marathi" in name_lower:
        return "marathi"
    return "other"


BREAK_MINUTES = 5  # Mandatory 5-minute break between consecutive study slots


def assign_time_slots(tasks: list, student) -> list:
    """
    Walk through tasks in order and assign start_time / end_time fields.
    Inserts a 5-minute break between every pair of consecutive tasks.
    
    Uses student.preferred_study_start_time if available, otherwise falls
    back to get_default_start_time(student.preferred_study_time).
    """
    from datetime import datetime, timedelta

    start_str = student.preferred_study_start_time
    if not start_str:
        pst = student.preferred_study_time
        pst_val = pst.value if hasattr(pst, 'value') else pst
        start_str = get_default_start_time(pst_val)

    try:
        cursor = datetime.strptime(start_str, "%H:%M")
    except ValueError:
        cursor = datetime.strptime("09:00", "%H:%M")

    for i, task in enumerate(tasks):
        task.start_time = cursor.strftime("%I:%M %p")
        end_cursor = cursor + timedelta(minutes=task.allocated_minutes)
        task.end_time = end_cursor.strftime("%I:%M %p")

        # Add 5-minute break before next task (skip after last task)
        if i < len(tasks) - 1:
            cursor = end_cursor + timedelta(minutes=BREAK_MINUTES)
        else:
            cursor = end_cursor

    return tasks


@router.post("/daily", response_model=DailyPlanResponse)
async def generate_daily_plan(
    request: GenerateDailyPlanRequest,
    db: AsyncSession = Depends(get_db)
):
    planner_repo = PlannerRepository(db)
    progress_repo = ProgressRepository(db)

    # 1. Verify student profile
    student = await planner_repo.get_student_profile(request.student_id)
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Student with id {request.student_id} not found."
        )

    # Check if student completed compulsory diagnostic sections (Aptitude + at least 1 academic subsection)
    completed_session_stmt = sa_text("""
        SELECT user_ass_id as session_id, 'START_OF_YEAR' as entry_point 
        FROM xxed_user_assessment_data 
        WHERE user_id = :sid AND result_status = 'COMPLETED'
        ORDER BY user_ass_id DESC LIMIT 1
    """)
    res_session = await db.execute(completed_session_stmt, {"sid": request.student_id})
    session_row = res_session.fetchone()
    if not session_row:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No completed diagnostic session found. Please complete the diagnostic assessment first."
        )

    entry_point = session_row.entry_point

    if entry_point != 'END_OF_TERM':
        apt_count_stmt = sa_text("""
            SELECT COUNT(*) 
            FROM xxed_user_answer_data uad
            JOIN xxed_user_assessment_data uass ON uad.user_ass_id = uass.user_ass_id
            WHERE uass.user_id = :student_id AND uass.result_status = 'COMPLETED'
              AND uad.aptitude_question_id IS NOT NULL AND uad.user_answer IS NOT NULL
        """)
        res_apt = await db.execute(apt_count_stmt, {"student_id": request.student_id})
        apt_count = res_apt.scalar()

        acad_count_stmt = sa_text("""
            SELECT COUNT(*) 
            FROM xxed_user_answer_data uad
            JOIN xxed_user_assessment_data uass ON uad.user_ass_id = uass.user_ass_id
            WHERE uass.user_id = :student_id AND uass.result_status = 'COMPLETED'
              AND uad.academic_question_id IS NOT NULL AND uad.user_answer IS NOT NULL
        """)
        res_acad = await db.execute(acad_count_stmt, {"student_id": request.student_id})
        acad_count = res_acad.scalar()

        if apt_count == 0 or acad_count == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Diagnostic assessment incomplete: Aptitude and at least one Academic subsection are compulsory for planners to work."
            )


    # Fetch diagnostic section times
    section_times = await planner_repo.get_diagnostic_section_times(request.student_id)

    # 2. Compute Master Weekly Schedule as the Single Source of Truth
    tracker = ProgressTracker(progress_repo)
    pq = await tracker.get_due_chapters_queue(request.student_id, request.plan_date)
    all_due = pq.get_all_ordered()

    due_chapters_weekly = []
    for item in all_due:
        ch_id, next_review, urgency, meta = item
        subj_sec = get_subject_section(meta["subject_name"])
        cost = section_times.get(subj_sec, 45)
        due_chapters_weekly.append({
            "chapter_id": ch_id,
            "cost": cost,
            "subject_id": meta["subject_id"],
            "subject_name": meta["subject_name"],
            "chapter_name": meta["chapter_name"],
            "chapter_number": meta["chapter_number"],
            "display_order": meta.get("display_order", 0),
            "priority": urgency
        })

    weekly_plan = WeeklyPlanner.generate_weekly_plan(
        due_chapters=due_chapters_weekly,
        daily_study_hours=float(student.daily_study_hours)
    )

    # Determine weekday number (1 = Monday, ..., 7 = Sunday)
    plan_weekday_num = request.plan_date.weekday() + 1
    matching_weekly_day = next((d for d in weekly_plan if d["day_number"] == plan_weekday_num), None)
    expected_tasks = matching_weekly_day["tasks"] if matching_weekly_day else []
    [t["chapter_id"] for t in expected_tasks]

    # 3. Enforce Immutable Daily Boundary: If tasks exist for today, preserve them immutably
    existing_tasks = await planner_repo.get_daily_plan_tasks(request.student_id, request.plan_date)
    
    if existing_tasks and not (request.force_regenerate and not any(t.get('status') == 'COMPLETED' for t in existing_tasks)):
        tasks = []
        for t in existing_tasks:
            stage_info = await progress_repo.get_chapter_stage_state(request.student_id, t['chapter_id'])
            tasks.append(
                TaskModel(
                    task_id=t['task_id'],
                    chapter_id=t['chapter_id'],
                    chapter_name=t['chapter_name'],
                    subject_name=t['subject_name'],
                    allocated_minutes=t['allocated_minutes'],
                    status=t['status'].value if hasattr(t['status'], 'value') else t['status'],
                    carried_forward_from_task_id=t['carried_forward_from_task_id'],
                    completed_at=t['completed_at'],
                    current_stage=stage_info.get("current_stage", "CONCEPT_STUDY"),
                    concept_completed=stage_info.get("concept_completed", False),
                    practice_completed=stage_info.get("practice_completed", False),
                    recall_completed=stage_info.get("recall_completed", False),
                    assessment_unlocked=stage_info.get("assessment_unlocked", False),
                    mastery_score=stage_info.get("mastery_score")
                )
            )
        tasks = assign_time_slots(tasks, student)
        total_time = sum(t.allocated_minutes for t in tasks)
        daily_cap = int(float(student.daily_study_hours or 3.0) * 60)
        return DailyPlanResponse(
            student_id=request.student_id,
            plan_date=request.plan_date,
            strategy_used="aligned_weekly",
            total_allocated_minutes=total_time,
            capacity_minutes=daily_cap,
            tasks=tasks
        )

    # 4. Clean uncompleted tasks and purge old historical debris
    await planner_repo.purge_stale_uncompleted_tasks_before(request.student_id, request.plan_date)
    if existing_tasks:
        await planner_repo.delete_uncompleted_daily_plan_tasks(request.student_id, request.plan_date)


    # 5. Gather yesterday's incomplete tasks (IN_PROGRESS, SKIPPED) strictly from D-1
    incomplete_tasks = await planner_repo.get_yesterday_incomplete_tasks(request.student_id, request.plan_date)
    carry_forwards, reserved_time = resolve_carry_forward_candidates(incomplete_tasks, request.plan_date)
    cf_chapter_ids = set(c['chapter_id'] for c in carry_forwards)


    # Merge carry-forwards and today's planned weekly tasks
    merged_tasks_data = []

    # 1. Add carry forwards
    for cf in carry_forwards:
        merged_tasks_data.append({
            "student_id": request.student_id,
            "plan_date": request.plan_date,
            "chapter_id": cf['chapter_id'],
            "allocated_minutes": cf['cost'],
            "status": "PENDING",
            "carried_forward_from_task_id": cf['carried_forward_from_task_id'],
            "chapter_name": cf['metadata']['chapter_name'],
            "subject_name": cf['metadata']['subject_name']
        })

    # 2. Add today's planned weekly tasks
    for task in expected_tasks:
        if task['chapter_id'] not in cf_chapter_ids:
            merged_tasks_data.append({
                "student_id": request.student_id,
                "plan_date": request.plan_date,
                "chapter_id": task['chapter_id'],
                "allocated_minutes": task['cost'],
                "status": "PENDING",
                "carried_forward_from_task_id": None,
                "chapter_name": task['chapter_name'],
                "subject_name": task['subject_name']
            })

    # Save to database
    if merged_tasks_data:
        await planner_repo.save_daily_plan_tasks(merged_tasks_data)

    # Build response (fetching all today's tasks to include completed and newly added tasks)
    all_today_tasks = await planner_repo.get_daily_plan_tasks(request.student_id, request.plan_date)
    
    tasks = []
    for t in all_today_tasks:
        stage_info = await progress_repo.get_chapter_stage_state(request.student_id, t['chapter_id'])
        tasks.append(
            TaskModel(
                task_id=t['task_id'],
                chapter_id=t['chapter_id'],
                chapter_name=t['chapter_name'],
                subject_name=t['subject_name'],
                allocated_minutes=t['allocated_minutes'],
                status=t['status'].value if hasattr(t['status'], 'value') else t['status'],
                carried_forward_from_task_id=t['carried_forward_from_task_id'],
                completed_at=t['completed_at'],
                current_stage=stage_info.get("current_stage", "CONCEPT_STUDY"),
                concept_completed=stage_info.get("concept_completed", False),
                practice_completed=stage_info.get("practice_completed", False),
                recall_completed=stage_info.get("recall_completed", False),
                assessment_unlocked=stage_info.get("assessment_unlocked", False),
                mastery_score=stage_info.get("mastery_score")
            )
        )

    tasks = assign_time_slots(tasks, student)
    total_time = sum(t.allocated_minutes for t in tasks)
    daily_cap = int(float(student.daily_study_hours or 3.0) * 60)

    return DailyPlanResponse(
        student_id=request.student_id,
        plan_date=request.plan_date,
        strategy_used="aligned_weekly",
        total_allocated_minutes=total_time,
        capacity_minutes=daily_cap,
        tasks=tasks
    )




@router.patch("/daily/task/{task_id}", response_model=PatchTaskResponse)
async def patch_task(
    task_id: int,
    request: PatchTaskRequest,
    db: AsyncSession = Depends(get_db)
):
    planner_repo = PlannerRepository(db)
    progress_repo = ProgressRepository(db)

    # 1. Verify task exists
    task = await planner_repo.get_task(task_id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task with id {task_id} not found."
        )

    # 2. Update task status in database
    await planner_repo.patch_task_status(task_id, request.status)

    # 3. If COMPLETED, nudge next_review_date by 1 day in chapter_mastery
    if request.status == 'COMPLETED':
        mastery = await progress_repo.get_chapter_mastery(task.student_id, task.chapter_id)
        if mastery:
            next_date = (mastery.next_review_date or date.today()) + timedelta(days=1)
            # Update next review date
            await progress_repo.save_chapter_mastery(
                student_id=task.student_id,
                chapter_id=task.chapter_id,
                mastery_score=float(mastery.mastery_score),
                ease_factor=float(mastery.ease_factor),
                interval_days=mastery.interval_days,
                repetitions=mastery.repetitions,
                next_review_date=next_date
            )

    # 4. Adaptive weekly re-pack is triggered
    # (Since this is a lightweight prototype, we return success; the dashboard will reload
    # and fetch the updated daily and weekly plans from the API).
    return PatchTaskResponse(
        task_id=task_id,
        status=request.status,
        message="Task status updated successfully."
    )


@router.post("/weekly", response_model=WeeklyPlanResponse)
async def generate_weekly_plan(
    request: GenerateWeeklyPlanRequest,
    db: AsyncSession = Depends(get_db)
):
    planner_repo = PlannerRepository(db)
    progress_repo = ProgressRepository(db)

    # 1. Verify student exists
    student = await planner_repo.get_student_profile(request.student_id)
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Student with id {request.student_id} not found."
        )

    # Check if student completed compulsory diagnostic sections (Aptitude + at least 1 academic subsection)
    completed_session_stmt = sa_text("""
        SELECT user_ass_id as session_id, 'START_OF_YEAR' as entry_point 
        FROM xxed_user_assessment_data 
        WHERE user_id = :sid AND result_status = 'COMPLETED'
        ORDER BY user_ass_id DESC LIMIT 1
    """)
    res_session = await db.execute(completed_session_stmt, {"sid": request.student_id})
    session_row = res_session.fetchone()
    if not session_row:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No completed diagnostic session found. Please complete the diagnostic assessment first."
        )

    entry_point = session_row.entry_point

    if entry_point != 'END_OF_TERM':
        apt_count_stmt = sa_text("""
            SELECT COUNT(*) 
            FROM xxed_user_answer_data uad
            JOIN xxed_user_assessment_data uass ON uad.user_ass_id = uass.user_ass_id
            WHERE uass.user_id = :student_id AND uass.result_status = 'COMPLETED'
              AND uad.aptitude_question_id IS NOT NULL AND uad.user_answer IS NOT NULL
        """)
        res_apt = await db.execute(apt_count_stmt, {"student_id": request.student_id})
        apt_count = res_apt.scalar()

        acad_count_stmt = sa_text("""
            SELECT COUNT(*) 
            FROM xxed_user_answer_data uad
            JOIN xxed_user_assessment_data uass ON uad.user_ass_id = uass.user_ass_id
            WHERE uass.user_id = :student_id AND uass.result_status = 'COMPLETED'
              AND uad.academic_question_id IS NOT NULL AND uad.user_answer IS NOT NULL
        """)
        res_acad = await db.execute(acad_count_stmt, {"student_id": request.student_id})
        acad_count = res_acad.scalar()

        if apt_count == 0 or acad_count == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Diagnostic assessment incomplete: Aptitude and at least one Academic subsection are compulsory for planners to work."
            )

    # Fetch diagnostic section times
    section_times = await planner_repo.get_diagnostic_section_times(request.student_id)

    # 2. Get due chapters queue from ProgressTracker
    tracker = ProgressTracker(progress_repo)
    pq = await tracker.get_due_chapters_queue(request.student_id, date.today())
    all_due = pq.get_all_ordered()


    # 3. Format candidates for the weekly planner
    due_chapters = []
    for item in all_due:
        ch_id, next_review, urgency, meta = item
        subj_sec = get_subject_section(meta["subject_name"])
        cost = section_times.get(subj_sec, 45)
        due_chapters.append({
            "chapter_id": ch_id,
            "cost": cost,
            "subject_id": meta["subject_id"],
            "subject_name": meta["subject_name"],
            "chapter_name": meta["chapter_name"],
            "chapter_number": meta["chapter_number"],
            "display_order": meta.get("display_order", 0),
            "priority": urgency
        })

    # 4. Generate weekly plan using topological sort and First-Fit-Decreasing bin packing
    weekly_plan = WeeklyPlanner.generate_weekly_plan(
        due_chapters=due_chapters,
        daily_study_hours=float(student.daily_study_hours)
    )

    # 5. Format response with calendar date anchoring
    today = date.today()
    monday_start = today - timedelta(days=today.weekday())
    sunday_end = monday_start + timedelta(days=6)

    response_days = []
    for day in weekly_plan:
        d_num = day["day_number"]  # 1 to 7
        card_date = monday_start + timedelta(days=d_num - 1)
        is_today = (card_date == today)

        day_tasks = []
        for t in day["tasks"]:
            stage_info = await progress_repo.get_chapter_stage_state(request.student_id, t["chapter_id"])
            day_tasks.append(
                WeeklyDayTaskModel(
                    chapter_id=t["chapter_id"],
                    chapter_name=t["chapter_name"],
                    subject_name=t["subject_name"],
                    cost=t["cost"],
                    current_stage=stage_info.get("current_stage", "CONCEPT_STUDY"),
                    concept_completed=stage_info.get("concept_completed", False),
                    practice_completed=stage_info.get("practice_completed", False),
                    recall_completed=stage_info.get("recall_completed", False),
                    assessment_unlocked=stage_info.get("assessment_unlocked", False)
                )
            )
        response_days.append(
            WeeklyDayPlanModel(
                day_number=d_num,
                date=card_date.isoformat(),
                formatted_date=card_date.strftime("%b %d"),
                is_today=is_today,
                allocated_minutes=day["allocated_minutes"],
                capacity_minutes=day["capacity_minutes"],
                tasks=day_tasks
            )
        )

    return WeeklyPlanResponse(
        student_id=request.student_id,
        week_start_date=monday_start.isoformat(),
        week_end_date=sunday_end.isoformat(),
        days=response_days
    )


@router.get("/commitments", response_model=CommitmentsResponse)
async def get_student_commitments(
    user_id: int = Query(..., description="Student/User ID"),
    db: AsyncSession = Depends(get_db)
):
    student_id = user_id
    stmt = sa_text("SELECT commitments_schedule FROM xxed_user_profile_tab WHERE user_id = :sid")
    res = await db.execute(stmt, {"sid": student_id})
    row = res.fetchone()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Student profile with id {student_id} not found."
        )
    commitments_data = row.commitments_schedule
    if commitments_data is None:
        commitments_data = []
    elif isinstance(commitments_data, str):
        import json
        try:
            commitments_data = json.loads(commitments_data)
        except Exception:
            commitments_data = []
    
    return CommitmentsResponse(
        student_id=student_id,
        commitments=commitments_data
    )


@router.put("/commitments/{student_id}", response_model=CommitmentsResponse)
async def update_student_commitments(
    student_id: int,
    request: UpdateCommitmentsRequest,
    db: AsyncSession = Depends(get_db)
):
    import json
    commitments_list = [c.model_dump() for c in request.commitments]
    stmt = sa_text("""
        UPDATE xxed_user_profile_tab
        SET commitments_schedule = :sched, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = :sid
    """)
    res = await db.execute(stmt, {
        "sched": json.dumps(commitments_list),
        "sid": student_id
    })
    await db.commit()
    if res.rowcount == 0:
        check_stmt = sa_text("SELECT user_id FROM xxed_user_profile_tab WHERE user_id = :sid")
        c_res = await db.execute(check_stmt, {"sid": student_id})
        if not c_res.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Student profile with id {student_id} not found."
            )

    return CommitmentsResponse(
        student_id=student_id,
        commitments=request.commitments
    )


@router.post("/dynamic-slots", response_model=GenerateDynamicSlotsResponse)
async def generate_student_dynamic_slots(
    request: GenerateDynamicSlotsRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Computes available dynamic time gaps throughout the student's operable domain [06:00, 22:00]
    and places active recall testing slots (Post-Sleep Retention, Micro-Drill, Spaced Revision).
    """
    student_id = request.student_id
    plan_date = request.plan_date
    
    # 1. Fetch Planned Study Tasks for the day
    tasks = await PlannerRepository.get_daily_plan(db, student_id, plan_date)
    planned_slots = []
    for t in tasks:
        if t.start_time and t.end_time:
            s_min = time_str_to_minutes(t.start_time)
            e_min = time_str_to_minutes(t.end_time)
            if e_min > s_min:
                planned_slots.append({
                    "start_min": s_min,
                    "end_min": e_min,
                    "label": t.chapter_name
                })
                
    # 2. Ingest Commitments (from request or DB)
    commitments_input = request.commitments
    if commitments_input is None:
        stmt = sa_text("SELECT commitments_schedule FROM xxed_user_profile_tab WHERE user_id = :sid")
        res = await db.execute(stmt, {"sid": student_id})
        row = res.fetchone()
        if row and row.commitments_schedule:
            import json
            raw_sched = row.commitments_schedule
            if isinstance(raw_sched, str):
                try:
                    commitments_input = json.loads(raw_sched)
                except Exception:
                    commitments_input = []
            elif isinstance(raw_sched, list):
                commitments_input = raw_sched
            else:
                commitments_input = []
        else:
            commitments_input = []
            
    commitment_intervals = []
    day_name = plan_date.strftime("%a").upper() # 'MON', 'TUE', etc.
    target_iso = plan_date.isoformat()
    
    for c in (commitments_input or []):
        rec_type = c.get("recurrence_type", "WEEKLY_RECURRING")
        days = c.get("days_of_week", [])
        spec_date = c.get("specific_date")
        
        # Check recurrence match
        applies = False
        if rec_type == "SPECIFIC_DATE" and spec_date == target_iso:
            applies = True
        elif rec_type == "WEEKLY_RECURRING":
            if not days or day_name in [d.upper() for d in days]:
                applies = True
                
        if applies and "start_time" in c and "end_time" in c:
            s_min = time_str_to_minutes(c["start_time"])
            e_min = time_str_to_minutes(c["end_time"])
            if e_min > s_min:
                commitment_intervals.append({
                    "start_min": s_min,
                    "end_min": e_min,
                    "label": c.get("label", "Commitment")
                })
                
    # 3. Compute Adaptive Test Slots
    dynamic_slots_data = generate_adaptive_test_slots(
        commitments=commitment_intervals,
        planned_study_slots=planned_slots
    )
    
    slot_models = [DynamicSlotModel(**slot) for slot in dynamic_slots_data]
    total_dynamic_mins = sum(s.duration_minutes for s in slot_models)
    
    return GenerateDynamicSlotsResponse(
        student_id=student_id,
        plan_date=plan_date,
        dynamic_slots=slot_models,
        total_dynamic_minutes=total_dynamic_mins
    )







