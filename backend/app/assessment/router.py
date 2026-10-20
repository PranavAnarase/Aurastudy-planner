"""
Assessment & Dynamic Timetable Rebalancing Router.
Handles chapter assessments lifecycle, grading, mastery EMA updating,
tier classification, spaced review retention, and weekly timetable rebalancing.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func, text as sa_text
from datetime import date
from typing import Dict, List

from app.database import get_db
from app.models.student_profile import StudentProfile
from app.models.chapter import Chapter
from app.models.subject import Subject
from app.models.academic_question import AcademicQuestion
from app.models.chapter_question_bank import ChapterQuestionBank
from app.models.chapter_mastery import ChapterMastery
from app.models.chapter_assessment import (
    ChapterAssessment,
    ChapterAssessmentItem,
    AssessmentStatusEnum,
    AssessmentTypeEnum,
    AttemptStatusEnum
)
from app.planner.rebalancer import (
    STANDARD_7_SUBJECTS,
    calculate_raw_score,
    compute_ema_mastery_40_60,
    execute_rebalancing_pipeline
)
from .tier_actions import classify_performance_tier
from .assessment_engine import assemble_chapter_assessment
from .spaced_review import (
    get_due_spaced_reviews,
    process_spaced_review_result
)
from .models import (
    StartAssessmentRequest,
    StartAssessmentResponse,
    AssessmentQuestionItem,
    SubmitAssessmentRequest,
    SubmitAssessmentResponse,
    QuestionReviewItem,
    MasteryUpdateDetails,
    TierActionDetails,
    TimetableAllocationImpact,
    DueSpacedReviewsResponse,
    DueSpacedReviewItem,
    StartSpacedReviewResponse,
    SubmitSpacedReviewResponse,
    DynamicRecallQuestionsRequest,
    DynamicRecallQuestionsResponse,
    DynamicRecallQuestionItem
)
from pydantic import BaseModel
from typing import Optional
import random

router = APIRouter(prefix="/assessment", tags=["Assessment & Dynamic Timetable"])
v1_router = APIRouter()


from app.progress.subject_criticality import SubjectCriticalityEngine, STANDARD_7_SUBJECTS
from app.progress.stage_pipeline import StagePipelineEngine, StageEnum
from .ai_diagnostics import GroqAssessmentDiagnosticService


class AdvanceStageRequest(BaseModel):
    student_id: int
    chapter_id: int
    completed_stage: str
    target_stage: Optional[str] = None


@router.get("/chapter/{chapter_id}/pipeline/{student_id}")
async def get_chapter_pipeline(
    chapter_id: int,
    student_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieves the active 4-stage pipeline state (Concept -> Practice -> Recall -> Assess) and learning materials for a chapter.
    """
    stmt_ch = select(Chapter, Subject).join(Subject, Chapter.subject_id == Subject.subject_id).where(Chapter.chapter_id == chapter_id)
    res_ch = await db.execute(stmt_ch)
    row = res_ch.first()
    if not row:
        raise HTTPException(status_code=404, detail=f"Chapter {chapter_id} not found")
    chapter, subject = row

    from app.progress.repository import ProgressRepository
    progress_repo = ProgressRepository(db)
    state = await progress_repo.get_chapter_stage_state(student_id, chapter_id)

    # Query real chapter questions directly from academic_questions / chapter_question_bank
    stmt_q = select(AcademicQuestion).where(AcademicQuestion.chapter_id == chapter_id).limit(15)
    res_q = await db.execute(stmt_q)
    questions = list(res_q.scalars().all())

    if not questions:
        try:
            stmt_cq = select(ChapterQuestionBank).where(ChapterQuestionBank.chapter_id == chapter_id).limit(15)
            res_cq = await db.execute(stmt_cq)
            questions = list(res_cq.scalars().all())
        except Exception:
            pass

    content = StagePipelineEngine.build_pedagogical_content_from_questions(
        subject_name=subject.subject_name,
        chapter_name=chapter.chapter_name,
        chapter_number=chapter.chapter_number,
        questions=questions
    )

    return {
        "chapter_id": chapter_id,
        "chapter_name": chapter.chapter_name,
        "chapter_number": chapter.chapter_number,
        "subject_name": subject.subject_name,
        "pipeline_state": state,
        "content": content
    }



@router.post("/stage/progress")
async def advance_chapter_stage(
    req: AdvanceStageRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Advances a chapter along the 4-stage pedagogical learning pipeline.
    """
    from app.progress.repository import ProgressRepository
    progress_repo = ProgressRepository(db)
    state = await progress_repo.get_chapter_stage_state(req.student_id, req.chapter_id)

    concept_completed = state["concept_completed"]
    practice_completed = state["practice_completed"]
    recall_completed = state["recall_completed"]
    assessment_unlocked = state["assessment_unlocked"]

    if req.completed_stage == StageEnum.CONCEPT_STUDY.value:
        concept_completed = True
        current_stage = StageEnum.PRACTICE_DRILL.value
    elif req.completed_stage == StageEnum.PRACTICE_DRILL.value:
        practice_completed = True
        current_stage = StageEnum.ACTIVE_RECALL.value
    elif req.completed_stage == StageEnum.ACTIVE_RECALL.value:
        recall_completed = True
        assessment_unlocked = True
        current_stage = StageEnum.READY_FOR_ASSESSMENT.value
    elif req.completed_stage == StageEnum.READY_FOR_ASSESSMENT.value:
        current_stage = StageEnum.READY_FOR_ASSESSMENT.value
    else:
        current_stage = req.target_stage or state["current_stage"]

    await progress_repo.update_chapter_stage_state(
        student_id=req.student_id,
        chapter_id=req.chapter_id,
        current_stage=current_stage,
        concept_completed=concept_completed,
        practice_completed=practice_completed,
        recall_completed=recall_completed,
        assessment_unlocked=assessment_unlocked
    )

    updated_state = await progress_repo.get_chapter_stage_state(req.student_id, req.chapter_id)
    return {
        "success": True,
        "message": f"Advanced chapter {req.chapter_id} past {req.completed_stage} to {current_stage}",
        "pipeline_state": updated_state
    }


async def get_student_subject_masteries(session: AsyncSession, student_id: int) -> Dict[str, float]:
    """
    Computes aggregate mastery score per Standard 7 subject for a given student across standard chapters.
    """
    student = await session.get(StudentProfile, student_id)
    if not student:
        return {s: 50.0 for s in STANDARD_7_SUBJECTS}

    stmt = (
        select(Chapter.chapter_id, Subject.subject_name)
        .join(Subject, Chapter.subject_id == Subject.subject_id)
        .where(Subject.standard_id == student.standard_id)
    )
    res = await session.execute(stmt)
    chapters_data = [{"chapter_id": row[0], "subject_name": row[1]} for row in res.fetchall()]

    stmt_m = select(ChapterMastery).where(ChapterMastery.student_id == student_id)
    res_m = await session.execute(stmt_m)
    masteries_score_map = {m.chapter_id: float(m.mastery_score) for m in res_m.scalars().all()}

    return SubjectCriticalityEngine.compute_subject_masteries(chapters_data, masteries_score_map, default_unassessed=50.0)


@router.get("/chapters/available/{student_id}")
async def get_available_chapters_for_assessment(
    student_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Returns all Standard 7 academic chapters grouped by subject with progressive gating (locked/unlocked) and mastery scores.
    """

    student = await db.get(StudentProfile, student_id)
    if not student:
        raise HTTPException(status_code=404, detail=f"Student {student_id} not found")

    # Fetch chapters for student's standard
    stmt = (
        select(Chapter, Subject)
        .join(Subject, Chapter.subject_id == Subject.subject_id)
        .where(Subject.standard_id == student.standard_id)
        .order_by(Subject.subject_name.asc(), Chapter.chapter_id.asc())
    )
    res = await db.execute(stmt)
    rows = res.all()

    # Fetch student's masteries
    stmt_m = select(ChapterMastery).where(ChapterMastery.student_id == student_id)
    res_m = await db.execute(stmt_m)
    masteries = {m.chapter_id: m for m in res_m.scalars().all()}
    masteries_score_map = {cid: float(m.mastery_score) for cid, m in masteries.items()}

    # Progressive Chapter Gating (Chapter k+1 locked while Chapter k < 50%)
    chapters_list_for_gating = [
        {
            "chapter_id": ch.chapter_id,
            "subject_name": subj.subject_name,
            "chapter_number": ch.chapter_number,
            "chapter_name": ch.chapter_name,
            "display_order": ch.display_order
        }
        for ch, subj in rows
    ]
    gating_map = SubjectCriticalityEngine.evaluate_progressive_chapter_gating(
        chapters_list_for_gating,
        masteries_score_map
    )

    today = date.today()
    subjects_map: Dict[str, Any] = {}

    for ch, subj in rows:
        subj_name = subj.subject_name
        if subj_name not in subjects_map:
            subjects_map[subj_name] = {
                "subject_id": subj.subject_id,
                "subject_name": subj_name,
                "chapters": []
            }

        cid = ch.chapter_id
        m_rec = masteries.get(cid)
        mastery_score = float(m_rec.mastery_score) if m_rec else 0.0
        confidence = m_rec.confidence.value if (m_rec and hasattr(m_rec.confidence, 'value')) else (str(m_rec.confidence) if m_rec else "LOW")
        next_review = m_rec.next_review_date if m_rec else None
        is_due = (next_review is not None and next_review <= today) if next_review else False

        gate = gating_map.get(cid, {"is_locked": False, "is_unlocked": True, "unlock_requirement": None})

        subjects_map[subj_name]["chapters"].append({
            "chapter_id": cid,
            "chapter_name": ch.chapter_name,
            "chapter_number": ch.chapter_number,
            "mastery_score": mastery_score,
            "confidence": confidence,
            "interval_days": m_rec.interval_days if m_rec else 1,
            "next_review_date": str(next_review) if next_review else None,
            "is_due": is_due,
            "is_locked": gate["is_locked"],
            "is_unlocked": gate["is_unlocked"],
            "unlock_requirement": gate["unlock_requirement"]
        })

    # Calculate subject-wise aggregated mastery stats (Option A: Active/Attempted Chapters Only)
    for subj_name, subj_data in subjects_map.items():
        ch_list = subj_data["chapters"]
        total_ch = len(ch_list)

        # Filter to chapters the student has actively attempted or unlocked
        active_with_scores = [ch for ch in ch_list if float(ch.get("mastery_score", 0)) > 0]
        active_unlocked = [ch for ch in ch_list if ch.get("is_unlocked") is True]

        # Use attempted chapters if available, otherwise unlocked chapters
        eval_pool = active_with_scores if active_with_scores else (active_unlocked if active_unlocked else ch_list[:1])
        total_active = len(eval_pool)

        if total_active > 0:
            avg_score = round(sum(float(ch["mastery_score"]) for ch in eval_pool) / total_active, 2)
            mastered_count = sum(1 for ch in ch_list if float(ch["mastery_score"]) >= 50.0)
        else:
            avg_score = 0.0
            mastered_count = 0

        conf = "HIGH" if avg_score >= 90.0 else ("MEDIUM" if avg_score >= 50.0 else "LOW")
        gap = round(max(0.0, 100.0 - avg_score), 2)

        subj_data["subject_mastery_score"] = avg_score
        subj_data["subject_confidence"] = conf
        subj_data["mastered_chapters_count"] = mastered_count
        subj_data["active_chapters_count"] = total_active
        subj_data["total_chapters_count"] = total_ch
        subj_data["learning_gap"] = gap


    return {
        "student_id": student_id,
        "standard_id": student.standard_id,
        "subjects": list(subjects_map.values())
    }



async def get_assessment_question_objects(db: AsyncSession, assessment_id: int):
    stmt = (
        select(ChapterAssessmentItem)
        .where(ChapterAssessmentItem.assessment_id == assessment_id)
        .order_by(ChapterAssessmentItem.question_order.asc())
    )
    res = await db.execute(stmt)
    items = list(res.scalars().all())

    question_ids = [item.question_id for item in items]
    if not question_ids:
        return []

    res_aq = await db.execute(
        select(AcademicQuestion).where(AcademicQuestion.question_id.in_(question_ids))
    )
    qb_map = {q.question_id: q for q in res_aq.scalars().all()}

    results = []
    for item in items:
        q_obj = qb_map.get(item.question_id)
        if q_obj:
            results.append((item, q_obj))
    return results


@router.post("/dynamic-recall-questions", response_model=DynamicRecallQuestionsResponse)
async def get_dynamic_recall_questions(
    req: DynamicRecallQuestionsRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Selects real academic questions strictly from xxed_academic_question_tab for targeted candidate chapters.
    Ensures 100% precision between question text, options (A, B, C, D), and correct answer indices.
    """
    chapter_ids = req.chapter_ids
    if not chapter_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one chapter_id must be provided."
        )

    # 1. Query real questions strictly from xxed_academic_question_tab
    stmt = (
        select(AcademicQuestion, Chapter, Subject)
        .join(Chapter, AcademicQuestion.chapter_id == Chapter.chapter_id)
        .join(Subject, Chapter.subject_id == Subject.subject_id)
        .where(
            AcademicQuestion.chapter_id.in_(chapter_ids),
            AcademicQuestion.is_active == True,
            AcademicQuestion.option_a.isnot(None),
            AcademicQuestion.option_b.isnot(None)
        )
    )
    res = await db.execute(stmt)
    rows = res.all()

    if not rows:
        # Fallback without strict option_b check if needed
        stmt_fallback = (
            select(AcademicQuestion, Chapter, Subject)
            .join(Chapter, AcademicQuestion.chapter_id == Chapter.chapter_id)
            .join(Subject, Chapter.subject_id == Subject.subject_id)
            .where(
                AcademicQuestion.chapter_id.in_(chapter_ids),
                AcademicQuestion.is_active == True
            )
        )
        res_fb = await db.execute(stmt_fallback)
        rows = res_fb.all()

    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No active academic questions found in xxed_academic_question_tab for chapters {chapter_ids}."
        )

    # 2. Group by difficulty for balanced distribution
    by_diff: Dict[str, List[Any]] = {"Easy": [], "Average": [], "Difficult": []}
    for row in rows:
        q, ch, subj = row
        diff_str = str(q.difficulty or 'Average').capitalize()
        if diff_str not in by_diff:
            diff_str = "Average"
        by_diff[diff_str].append(row)

    total_needed = min(req.question_count, len(rows))
    easy_target = int(round(0.40 * total_needed))
    avg_target = int(round(0.40 * total_needed))
    diff_target = total_needed - (easy_target + avg_target)
    targets = {"Easy": easy_target, "Average": avg_target, "Difficult": diff_target}

    selected_rows = []
    for diff_name, count in targets.items():
        pool = list(by_diff[diff_name])
        random.shuffle(pool)
        selected_rows.extend(pool[:count])

    # Backfill if any difficulty bucket had fewer than target
    if len(selected_rows) < total_needed:
        selected_ids = {r[0].question_id for r in selected_rows}
        remaining = [r for r in rows if r[0].question_id not in selected_ids]
        random.shuffle(remaining)
        needed = total_needed - len(selected_rows)
        selected_rows.extend(remaining[:needed])

    random.shuffle(selected_rows)

    # 3. Construct response items with deterministic option index binding
    option_index_map = {"A": 0, "B": 1, "C": 2, "D": 3}
    question_items: List[DynamicRecallQuestionItem] = []

    for q, ch, subj in selected_rows:
        opt_a = (q.option_a or "").strip()
        opt_b = (q.option_b or "").strip()
        opt_c = (q.option_c or "").strip()
        opt_d = (q.option_d or "").strip()

        # Build options list matching exact letters A, B, C, D
        options_list = [opt_a, opt_b]
        if opt_c:
            options_list.append(opt_c)
        if opt_d:
            options_list.append(opt_d)

        raw_correct = (q.correct_option or "A").strip().upper()
        if raw_correct not in option_index_map:
            raw_correct = "A"
        correct_idx = option_index_map[raw_correct]

        # Ensure correct index is within bounds of available options
        if correct_idx >= len(options_list):
            correct_idx = 0
            raw_correct = "A"

        explanation_text = q.correct_answer_text
        if not explanation_text:
            correct_text = options_list[correct_idx] if correct_idx < len(options_list) else opt_a
            explanation_text = f"The correct answer is Option {raw_correct}: {correct_text}"

        question_items.append(
            DynamicRecallQuestionItem(
                question_id=q.question_id,
                chapter_id=q.chapter_id,
                chapter_name=ch.chapter_name,
                subject_name=subj.subject_name,
                question_text=q.question_text,
                option_a=opt_a,
                option_b=opt_b,
                option_c=opt_c,
                option_d=opt_d,
                options=options_list,
                correct_option=raw_correct,
                correct_index=correct_idx,
                difficulty=str(q.difficulty or 'Average'),
                explanation=explanation_text,
                marks=float(q.marks or 1.0)
            )
        )

    return DynamicRecallQuestionsResponse(
        student_id=req.student_id,
        total_questions=len(question_items),
        activity_type=req.activity_type or "MICRO_DRILL",
        questions=question_items
    )


class DynamicRecallCompletionRequest(BaseModel):
    student_id: int
    slot_id: str
    completed_date: Optional[str] = None
    activity_type: Optional[str] = None
    accuracy: Optional[float] = 0.0
    obtained_marks: Optional[float] = 0.0
    total_marks: Optional[float] = 0.0
    time_taken_seconds: Optional[int] = 0


@router.post("/dynamic-recall/complete")
async def record_dynamic_recall_completion(
    req: DynamicRecallCompletionRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Persistently records completion of a dynamic recall test slot for a student on a specific date in the database.
    """
    comp_date = req.completed_date or str(date.today())
    await db.execute(sa_text("""
        INSERT INTO xxed_dynamic_recall_completions
        (student_id, slot_id, completed_date, activity_type, accuracy, obtained_marks, total_marks, time_taken_seconds)
        VALUES (:sid, :slot, :cdate, :atype, :acc, :obt, :tot, :tt)
        ON DUPLICATE KEY UPDATE
            activity_type = VALUES(activity_type),
            accuracy = VALUES(accuracy),
            obtained_marks = VALUES(obtained_marks),
            total_marks = VALUES(total_marks),
            time_taken_seconds = VALUES(time_taken_seconds),
            completed_at = CURRENT_TIMESTAMP
    """), {
        "sid": req.student_id,
        "slot": req.slot_id,
        "cdate": comp_date,
        "atype": req.activity_type,
        "acc": req.accuracy,
        "obt": req.obtained_marks,
        "tot": req.total_marks,
        "tt": req.time_taken_seconds
    })
    await db.commit()
    return {
        "success": True,
        "student_id": req.student_id,
        "slot_id": req.slot_id,
        "completed_date": comp_date
    }


@router.get("/dynamic-recall/completed/{student_id}")
async def get_completed_dynamic_recall_slots(
    student_id: int,
    completed_date: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Returns list of slot_ids completed by the student on the specified date (defaults to today).
    """
    target_date = completed_date or str(date.today())
    res = await db.execute(sa_text("""
        SELECT slot_id, activity_type, accuracy, completed_at
        FROM xxed_dynamic_recall_completions
        WHERE student_id = :sid AND completed_date = :cdate
    """), {
        "sid": student_id,
        "cdate": target_date
    })
    rows = res.fetchall()
    slot_ids = [r[0] for r in rows]
    return {
        "student_id": student_id,
        "date": target_date,
        "completed_slot_ids": slot_ids,
        "count": len(slot_ids)
    }


@router.post("/chapters/{chapter_id}/start", response_model=StartAssessmentResponse)
async def start_chapter_assessment(
    chapter_id: int,
    req: StartAssessmentRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Starts an internal chapter assessment (10 to 15 questions with 40/40/20 difficulty distribution).
    Enforces progressive gating (rejects attempts on locked chapters).
    """
    # 1. Verify student
    student = await db.get(StudentProfile, req.student_id)
    if not student:
        raise HTTPException(status_code=404, detail=f"Student {req.student_id} not found")

    # 2. Verify chapter
    stmt_ch = select(Chapter, Subject).join(Subject, Chapter.subject_id == Subject.subject_id).where(Chapter.chapter_id == chapter_id)
    res_ch = await db.execute(stmt_ch)
    row = res_ch.first()
    if not row:
        raise HTTPException(status_code=404, detail=f"Chapter {chapter_id} not found")
    chapter, subject = row

    # 3. Progressive Gating Check
    stmt_all = (
        select(Chapter, Subject)
        .join(Subject, Chapter.subject_id == Subject.subject_id)
        .where(Subject.standard_id == student.standard_id)
        .order_by(Chapter.chapter_id.asc())
    )
    all_rows = (await db.execute(stmt_all)).all()
    stmt_m = select(ChapterMastery).where(ChapterMastery.student_id == req.student_id)
    masteries_score_map = {m.chapter_id: float(m.mastery_score) for m in (await db.execute(stmt_m)).scalars().all()}

    chapters_gating_list = [
        {"chapter_id": c.chapter_id, "subject_name": s.subject_name, "chapter_number": c.chapter_number, "chapter_name": c.chapter_name}
        for c, s in all_rows
    ]
    gating = SubjectCriticalityEngine.evaluate_progressive_chapter_gating(chapters_gating_list, masteries_score_map)
    gate = gating.get(chapter_id, {"is_locked": False, "unlock_requirement": None})

    if gate.get("is_locked", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Chapter is locked. {gate.get('unlock_requirement', 'Prerequisite chapter test not yet passed with >= 50%')}"
        )

    # 4. Assemble assessment
    try:
        assessment = await assemble_chapter_assessment(
            session=db,
            student_id=req.student_id,
            chapter_id=chapter_id,
            total_questions=req.total_questions,
            assessment_type=AssessmentTypeEnum.CHAPTER_TEST
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


    # 4. Fetch questions for response payload
    item_rows = await get_assessment_question_objects(db, assessment.assessment_id)

    question_items = []
    for item, q in item_rows:
        question_items.append(
            AssessmentQuestionItem(
                question_id=q.question_id,
                question_order=item.question_order,
                question_text=q.question_text,
                difficulty=q.difficulty.value if hasattr(q.difficulty, 'value') else str(q.difficulty or 'Average'),
                marks=q.marks or 1,
                estimated_seconds=q.estimated_seconds or 60,
                option_a=q.option_a,
                option_b=q.option_b,
                option_c=q.option_c,
                option_d=q.option_d
            )
        )

    return StartAssessmentResponse(
        assessment_id=assessment.assessment_id,
        student_id=assessment.student_id,
        chapter_id=chapter_id,
        chapter_name=chapter.chapter_name,
        subject_name=subject.subject_name,
        attempt_number=assessment.attempt_number,
        total_questions=assessment.total_questions,
        total_marks=int(assessment.total_marks or len(question_items)),
        estimated_total_seconds=len(question_items) * 60,
        questions=question_items
    )


@router.post("/{assessment_id}/submit", response_model=SubmitAssessmentResponse)
async def submit_chapter_assessment(
    assessment_id: int,
    req: SubmitAssessmentRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Submits student responses, computes 40/60 EMA blend, updates chapter mastery,
    evaluates performance tier actions, and executes the 5-step dynamic timetable rebalancing.
    """
    # 1. Load assessment
    assessment = await db.get(ChapterAssessment, assessment_id)
    if not assessment:
        raise HTTPException(status_code=404, detail=f"Assessment {assessment_id} not found")
    if assessment.status == AssessmentStatusEnum.COMPLETED:
        raise HTTPException(status_code=400, detail="Assessment has already been completed")

    # Resolve chapter_id from the assessment template in xxed_assessments_tab
    _ch_res = await db.execute(sa_text(
        "SELECT chapter_id FROM xxed_assessments_tab WHERE assessment_id = :aid LIMIT 1"
    ), {"aid": assessment.template_assessment_id})
    _ch_row = _ch_res.fetchone()
    chapter_id = _ch_row[0] if _ch_row else None

    student = await db.get(StudentProfile, req.student_id)
    if not student:
        raise HTTPException(status_code=404, detail=f"Student {req.student_id} not found")

    # 2. Grade responses transactionally
    item_rows = await get_assessment_question_objects(db, assessment_id)
    items_map = {q.question_id: q for _, q in item_rows}

    submission_dict = {r.question_id: r for r in req.responses}

    total_marks = 0
    obtained_marks = 0
    correct_count = 0
    questions_diag_payload = []

    for q_id, q in items_map.items():
        sub = submission_dict.get(q_id)
        q_marks = q.marks or 1
        total_marks += q_marks
        
        selected = sub.selected_option.strip().upper() if (sub and sub.selected_option) else None
        correct = q.correct_option.strip().upper() if q.correct_option else None
        
        is_corr = (selected == correct) if (selected and correct) else False
        if is_corr:
            obtained_marks += q_marks
            correct_count += 1

        questions_diag_payload.append({
            "question_id": q_id,
            "question_text": q.question_text,
            "options": {
                "A": getattr(q, 'option_a', None),
                "B": getattr(q, 'option_b', None),
                "C": getattr(q, 'option_c', None),
                "D": getattr(q, 'option_d', None),
            },
            "selected_option": selected,
            "correct_option": correct,
            "is_correct": is_corr,
            "explanation": q.explanation
        })

    # 3. Step 1: Raw Attempt Scoring
    raw_score = calculate_raw_score(obtained_marks, total_marks)
    accuracy = round((correct_count / max(1, len(items_map))) * 100.0, 2)

    # Step 1b: Fetch chapter and subject info for AI Diagnostic Tutor
    stmt_ch_info = (
        select(Chapter, Subject)
        .join(Subject, Chapter.subject_id == Subject.subject_id)
        .where(Chapter.chapter_id == chapter_id)
    )
    res_ch_info = await db.execute(stmt_ch_info)
    ch_info_row = res_ch_info.first()
    ch_name = ch_info_row[0].chapter_name if ch_info_row else f"Chapter {chapter_id}"
    subj_name = ch_info_row[1].subject_name if ch_info_row else "Standard 7 Subject"

    # Generate Isolated Groq AI Diagnostic Explanations (Pure Explanatory Tutor Role)
    ai_diag_result = await GroqAssessmentDiagnosticService.generate_diagnostic_feedback(
        subject_name=subj_name,
        chapter_name=ch_name,
        accuracy=accuracy,
        obtained_marks=float(obtained_marks),
        total_marks=float(total_marks),
        questions_data=questions_diag_payload
    )
    ai_overall_summary = ai_diag_result.get("ai_overall_summary")
    q_diag_map = ai_diag_result.get("question_diagnostics", {})

    # Save question responses with per-question AI misconception & memory tips
    question_results: List[QuestionReviewItem] = []
    for q_id, q in items_map.items():
        sub = submission_dict.get(q_id)
        selected = sub.selected_option.strip().upper() if (sub and sub.selected_option) else None
        correct = q.correct_option.strip().upper() if q.correct_option else None
        is_corr = (selected == correct) if (selected and correct) else False

        time_taken = sub.time_taken_seconds if sub else 0
        status_enum = AttemptStatusEnum.ANSWERED if selected else AttemptStatusEnum.SKIPPED

        diag_item = q_diag_map.get(q_id, {})
        concept_gap = diag_item.get("ai_concept_gap")
        misconception_fb = diag_item.get("ai_misconception_feedback")
        memory_tip = diag_item.get("ai_memory_tip")

        # Update the existing answer row (created during /start) rather than inserting a new one
        await db.execute(sa_text("""
            UPDATE xxed_user_answer_data
            SET user_answer = :ans,
                obtained_marks = :marks,
                time_taken = :time_taken,
                attempt_status = :status
            WHERE user_ass_id = :aid AND academic_question_id = :qid
        """), {
            "ans": selected,
            "marks": 1.00 if is_corr else 0.00,
            "time_taken": time_taken,
            "status": status_enum.value if hasattr(status_enum, 'value') else str(status_enum),
            "aid": assessment_id,
            "qid": q_id
        })

        question_results.append(
            QuestionReviewItem(
                question_id=q_id,
                question_text=q.question_text,
                difficulty=q.difficulty.value if hasattr(q.difficulty, 'value') else str(q.difficulty or 'Average'),
                selected_option=selected,
                correct_option=correct,
                is_correct=is_corr,
                explanation=q.explanation,
                time_taken_seconds=time_taken,
                ai_concept_gap=concept_gap,
                ai_misconception_feedback=misconception_fb,
                ai_memory_tip=memory_tip
            )
        )

    # 4. Step 2: 40/60 EMA Mastery Update & Tier Actions
    stmt_mastery = select(ChapterMastery).where(
        and_(
            ChapterMastery.student_id == req.student_id,
            ChapterMastery.chapter_id == chapter_id
        )
    )
    res_m = await db.execute(stmt_mastery)
    mastery_record = res_m.scalar_one_or_none()

    old_mastery = float(mastery_record.mastery_score) if mastery_record else None
    updated_mastery = compute_ema_mastery_40_60(raw_score, old_mastery)

    # Performance tier classification
    today = date.today()
    tier_info = classify_performance_tier(updated_mastery, today=today)

    stage_to_set = StageEnum.COMPLETED.value if updated_mastery >= 50.0 else StageEnum.READY_FOR_ASSESSMENT.value

    if mastery_record:
        mastery_record.mastery_score = updated_mastery
        mastery_record.confidence = tier_info["confidence"]
        mastery_record.interval_days = tier_info["interval_days"]
        mastery_record.next_review_date = tier_info["next_review_date"]
        mastery_record.last_assessed = func.current_timestamp()
        mastery_record.current_stage = stage_to_set
        if updated_mastery >= 50.0:
            mastery_record.assessment_unlocked = 1
    else:
        mastery_record = ChapterMastery(
            student_id=req.student_id,
            chapter_id=chapter_id,
            mastery_score=updated_mastery,
            confidence=tier_info["confidence"],
            interval_days=tier_info["interval_days"],
            next_review_date=tier_info["next_review_date"],
            repetitions=1,
            current_stage=stage_to_set,
            concept_completed=1,
            practice_completed=1,
            recall_completed=1,
            assessment_unlocked=1
        )
        db.add(mastery_record)


    # Compute attempt metrics
    attempted_cnt = sum(1 for q_id in items_map if submission_dict.get(q_id) and submission_dict.get(q_id).selected_option)
    unattempted_cnt = max(0, len(items_map) - attempted_cnt)
    incorr_cnt = max(0, attempted_cnt - correct_count)
    tot_time_taken = sum((submission_dict.get(q_id).time_taken_seconds or 0) for q_id in items_map if submission_dict.get(q_id))

    # Update assessment session record with full statistics
    assessment.obtained_marks = obtained_marks
    assessment.total_marks = total_marks
    assessment.accuracy = accuracy
    assessment.percentage = accuracy
    assessment.total_questions = len(items_map)
    assessment.attempted_question = attempted_cnt
    assessment.un_attempted_question = unattempted_cnt
    assessment.correct_count = correct_count
    assessment.incorrect_count = incorr_cnt
    assessment.time_taken = tot_time_taken
    assessment.ai_overall_summary = ai_overall_summary
    assessment.status = AssessmentStatusEnum.COMPLETED
    assessment.completed_at = func.current_timestamp()

    await db.execute(sa_text("""
        UPDATE xxed_user_assessment_data
        SET obtained_marks = :obt_m,
            total_marks = :tot_m,
            accuracy = :acc,
            percentage = :acc,
            total_question = :tq,
            attempted_question = :att,
            un_attempted_question = :unatt,
            correct_count = :corr,
            incorrect_count = :incorr,
            time_taken = :tt,
            result_status = 'COMPLETED',
            ass_end_time = NOW()
        WHERE user_ass_id = :aid
    """), {
        "obt_m": float(obtained_marks),
        "tot_m": float(total_marks),
        "acc": float(accuracy),
        "tq": len(items_map),
        "att": attempted_cnt,
        "unatt": unattempted_cnt,
        "corr": correct_count,
        "incorr": incorr_cnt,
        "tt": tot_time_taken,
        "aid": assessment_id
    })

    await db.commit()

    # 5. Step 3, 4, 5: Dynamic Timetable Rebalancing (Weekly Budget = daily_study_hours * 7)
    subject_masteries = await get_student_subject_masteries(db, req.student_id)
    daily_hours = float(student.daily_study_hours or 3.0)
    rebalanced = execute_rebalancing_pipeline(subject_masteries, daily_hours)

    return SubmitAssessmentResponse(
        assessment_id=assessment_id,
        student_id=req.student_id,
        chapter_id=chapter_id,
        attempt_number=assessment.attempt_number,
        total_questions=len(items_map),
        obtained_marks=float(obtained_marks),
        total_marks=float(total_marks),
        accuracy=accuracy,
        raw_score=raw_score,
        ai_overall_summary=ai_overall_summary,
        mastery_update=MasteryUpdateDetails(
            old_mastery=old_mastery,
            raw_score=raw_score,
            updated_mastery=updated_mastery,
            confidence=tier_info["confidence"],
            interval_days=tier_info["interval_days"],
            next_review_date=tier_info["next_review_date"]
        ),
        tier_actions=TierActionDetails(
            tier=tier_info["tier"],
            action_summary=tier_info["action_summary"],
            recommendation=tier_info["recommendation"],
            days_per_week=tier_info["days_per_week"],
            block_duration_minutes=tier_info["block_duration_minutes"],
            unlock_next_chapter=tier_info["unlock_next_chapter"]
        ),
        rebalanced_timetable=TimetableAllocationImpact(
            weekly_budget_hours=rebalanced["weekly_budget_hours"],
            daily_study_hours=rebalanced["daily_study_hours"],
            subject_masteries=rebalanced["subject_masteries"],
            deficiency_gaps=rebalanced["deficiency_gaps"],
            raw_weights=rebalanced["raw_weights"],
            normalized_weights=rebalanced["normalized_weights"],
            allocated_hours=rebalanced["allocated_hours"],
            allocated_minutes=rebalanced["allocated_minutes"]
        ),
        question_results=question_results
    )


@router.get("/spaced-reviews/due/{student_id}", response_model=DueSpacedReviewsResponse)
async def list_due_spaced_reviews(
    student_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Returns all chapters where next_review_date <= CURRENT_DATE for Spaced Recall Quizzes.
    """
    student = await db.get(StudentProfile, student_id)
    if not student:
        raise HTTPException(status_code=404, detail=f"Student {student_id} not found")

    due_items = await get_due_spaced_reviews(db, student_id)
    review_models = [DueSpacedReviewItem(**item) for item in due_items]

    return DueSpacedReviewsResponse(
        student_id=student_id,
        total_due=len(review_models),
        reviews=review_models
    )


@router.post("/spaced-reviews/{chapter_id}/start", response_model=StartSpacedReviewResponse)
async def start_spaced_review_quiz(
    chapter_id: int,
    student_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Starts a 5-question Spaced Recall Quiz for a due chapter.
    """
    student = await db.get(StudentProfile, student_id)
    if not student:
        raise HTTPException(status_code=404, detail=f"Student {student_id} not found")

    stmt_ch = select(Chapter, Subject).join(Subject, Chapter.subject_id == Subject.subject_id).where(Chapter.chapter_id == chapter_id)
    res_ch = await db.execute(stmt_ch)
    row = res_ch.first()
    if not row:
        raise HTTPException(status_code=404, detail=f"Chapter {chapter_id} not found")
    chapter, subject = row

    try:
        assessment = await assemble_chapter_assessment(
            session=db,
            student_id=student_id,
            chapter_id=chapter_id,
            total_questions=5,
            assessment_type=AssessmentTypeEnum.SPACED_REVIEW
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    item_rows = await get_assessment_question_objects(db, assessment.assessment_id)

    question_items = [
        AssessmentQuestionItem(
            question_id=q.question_id,
            question_order=item.question_order,
            question_text=q.question_text,
            difficulty=q.difficulty.value if hasattr(q.difficulty, 'value') else str(q.difficulty or 'Average'),
            marks=q.marks or 1,
            estimated_seconds=q.estimated_seconds or 60,
            option_a=q.option_a,
            option_b=q.option_b,
            option_c=q.option_c,
            option_d=q.option_d
        )
        for item, q in item_rows
    ]

    return StartSpacedReviewResponse(
        assessment_id=assessment.assessment_id,
        student_id=student_id,
        chapter_id=chapter_id,
        chapter_name=chapter.chapter_name,
        subject_name=subject.subject_name,
        total_questions=len(question_items),
        total_marks=int(assessment.total_marks or len(question_items)),
        estimated_total_seconds=len(question_items) * 60,
        questions=question_items
    )


@router.post("/spaced-reviews/{assessment_id}/submit", response_model=SubmitSpacedReviewResponse)
async def submit_spaced_review_quiz(
    assessment_id: int,
    req: SubmitAssessmentRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Submits a Spaced Recall Quiz:
    - If Passed (>= 70%): doubles interval (7 -> 14 -> 30 days)
    - If Failed (< 70%): resets interval=1, downgrades to Developing, and triggers timetable rebalancing.
    """
    assessment = await db.get(ChapterAssessment, assessment_id)
    if not assessment:
        raise HTTPException(status_code=404, detail=f"Assessment {assessment_id} not found")
    if assessment.status == AssessmentStatusEnum.COMPLETED:
        raise HTTPException(status_code=400, detail="Assessment has already been completed")

    # Resolve chapter_id from the assessment template in xxed_assessments_tab
    _ch_res = await db.execute(sa_text(
        "SELECT chapter_id FROM xxed_assessments_tab WHERE assessment_id = :aid LIMIT 1"
    ), {"aid": assessment.template_assessment_id})
    _ch_row = _ch_res.fetchone()
    chapter_id = _ch_row[0] if _ch_row else None

    student = await db.get(StudentProfile, req.student_id)
    if not student:
        raise HTTPException(status_code=404, detail=f"Student {req.student_id} not found")

    # Grade responses
    item_rows = await get_assessment_question_objects(db, assessment_id)
    items_map = {q.question_id: q for _, q in item_rows}
    submission_dict = {r.question_id: r for r in req.responses}

    total_marks = 0
    obtained_marks = 0
    correct_count = 0
    questions_diag_payload = []

    for q_id, q in items_map.items():
        sub = submission_dict.get(q_id)
        q_marks = q.marks or 1
        total_marks += q_marks
        
        selected = sub.selected_option.strip().upper() if (sub and sub.selected_option) else None
        correct = q.correct_option.strip().upper() if q.correct_option else None
        is_corr = (selected == correct) if (selected and correct) else False
        
        if is_corr:
            obtained_marks += q_marks
            correct_count += 1

        questions_diag_payload.append({
            "question_id": q_id,
            "question_text": q.question_text,
            "options": {
                "A": getattr(q, 'option_a', None),
                "B": getattr(q, 'option_b', None),
                "C": getattr(q, 'option_c', None),
                "D": getattr(q, 'option_d', None),
            },
            "selected_option": selected,
            "correct_option": correct,
            "is_correct": is_corr,
            "explanation": q.explanation
        })

    raw_score = calculate_raw_score(obtained_marks, total_marks)
    accuracy = round((correct_count / max(1, len(items_map))) * 100.0, 2)

    # Fetch chapter & subject metadata for AI feedback
    stmt_ch_info = (
        select(Chapter, Subject)
        .join(Subject, Chapter.subject_id == Subject.subject_id)
        .where(Chapter.chapter_id == chapter_id)
    )
    res_ch_info = await db.execute(stmt_ch_info)
    ch_info_row = res_ch_info.first()
    ch_name = ch_info_row[0].chapter_name if ch_info_row else f"Chapter {chapter_id}"
    subj_name = ch_info_row[1].subject_name if ch_info_row else "Standard 7 Subject"

    ai_diag_result = await GroqAssessmentDiagnosticService.generate_diagnostic_feedback(
        subject_name=subj_name,
        chapter_name=ch_name,
        accuracy=accuracy,
        obtained_marks=float(obtained_marks),
        total_marks=float(total_marks),
        questions_data=questions_diag_payload
    )
    ai_overall_summary = ai_diag_result.get("ai_overall_summary")
    q_diag_map = ai_diag_result.get("question_diagnostics", {})

    question_results: List[QuestionReviewItem] = []
    for q_id, q in items_map.items():
        sub = submission_dict.get(q_id)
        selected = sub.selected_option.strip().upper() if (sub and sub.selected_option) else None
        correct = q.correct_option.strip().upper() if q.correct_option else None
        is_corr = (selected == correct) if (selected and correct) else False

        diag_item = q_diag_map.get(q_id, {})
        concept_gap = diag_item.get("ai_concept_gap")
        misconception_fb = diag_item.get("ai_misconception_feedback")
        memory_tip = diag_item.get("ai_memory_tip")

        time_taken = sub.time_taken_seconds if sub else 0
        status_enum = AttemptStatusEnum.ANSWERED if selected else AttemptStatusEnum.SKIPPED

        # Update the existing answer row (created during /start) rather than inserting a new one
        await db.execute(sa_text("""
            UPDATE xxed_user_answer_data
            SET user_answer = :ans,
                obtained_marks = :marks,
                time_taken = :time_taken,
                attempt_status = :status
            WHERE user_ass_id = :aid AND academic_question_id = :qid
        """), {
            "ans": selected,
            "marks": 1.00 if is_corr else 0.00,
            "time_taken": time_taken,
            "status": status_enum.value if hasattr(status_enum, 'value') else str(status_enum),
            "aid": assessment_id,
            "qid": q_id
        })

        question_results.append(
            QuestionReviewItem(
                question_id=q_id,
                question_text=q.question_text,
                difficulty=q.difficulty.value if hasattr(q.difficulty, 'value') else str(q.difficulty or 'Average'),
                selected_option=selected,
                correct_option=correct,
                is_correct=is_corr,
                explanation=q.explanation,
                time_taken_seconds=sub.time_taken_seconds if sub else 0,
                ai_concept_gap=concept_gap,
                ai_misconception_feedback=misconception_fb,
                ai_memory_tip=memory_tip
            )
        )

    # Process retention outcome
    review_outcome = await process_spaced_review_result(
        session=db,
        student_id=req.student_id,
        chapter_id=chapter_id,
        raw_score=raw_score
    )

    # Compute attempt metrics
    attempted_cnt = sum(1 for q_id in items_map if submission_dict.get(q_id) and submission_dict.get(q_id).selected_option)
    unattempted_cnt = max(0, len(items_map) - attempted_cnt)
    incorr_cnt = max(0, attempted_cnt - correct_count)
    tot_time_taken = sum((submission_dict.get(q_id).time_taken_seconds or 0) for q_id in items_map if submission_dict.get(q_id))

    assessment.obtained_marks = obtained_marks
    assessment.total_marks = total_marks
    assessment.accuracy = accuracy
    assessment.percentage = accuracy
    assessment.total_questions = len(items_map)
    assessment.attempted_question = attempted_cnt
    assessment.un_attempted_question = unattempted_cnt
    assessment.correct_count = correct_count
    assessment.incorrect_count = incorr_cnt
    assessment.time_taken = tot_time_taken
    assessment.ai_overall_summary = ai_overall_summary
    assessment.status = AssessmentStatusEnum.COMPLETED
    assessment.completed_at = func.current_timestamp()

    await db.execute(sa_text("""
        UPDATE xxed_user_assessment_data
        SET obtained_marks = :obt_m,
            total_marks = :tot_m,
            accuracy = :acc,
            percentage = :acc,
            total_question = :tq,
            attempted_question = :att,
            un_attempted_question = :unatt,
            correct_count = :corr,
            incorrect_count = :incorr,
            time_taken = :tt,
            result_status = 'COMPLETED',
            ass_end_time = NOW()
        WHERE user_ass_id = :aid
    """), {
        "obt_m": float(obtained_marks),
        "tot_m": float(total_marks),
        "acc": float(accuracy),
        "tq": len(items_map),
        "att": attempted_cnt,
        "unatt": unattempted_cnt,
        "corr": correct_count,
        "incorr": incorr_cnt,
        "tt": tot_time_taken,
        "aid": assessment_id
    })
    await db.commit()

    rebalanced_impact = None
    if review_outcome["trigger_rebalance"]:
        subject_masteries = await get_student_subject_masteries(db, req.student_id)
        daily_hours = float(student.daily_study_hours or 3.0)
        rebalanced = execute_rebalancing_pipeline(subject_masteries, daily_hours)
        rebalanced_impact = TimetableAllocationImpact(
            weekly_budget_hours=rebalanced["weekly_budget_hours"],
            daily_study_hours=rebalanced["daily_study_hours"],
            subject_masteries=rebalanced["subject_masteries"],
            deficiency_gaps=rebalanced["deficiency_gaps"],
            raw_weights=rebalanced["raw_weights"],
            normalized_weights=rebalanced["normalized_weights"],
            allocated_hours=rebalanced["allocated_hours"],
            allocated_minutes=rebalanced["allocated_minutes"]
        )

    return SubmitSpacedReviewResponse(
        assessment_id=assessment_id,
        student_id=req.student_id,
        chapter_id=chapter_id,
        raw_score=raw_score,
        passed=review_outcome["passed"],
        old_mastery=review_outcome["old_mastery"],
        new_mastery=review_outcome["new_mastery"],
        old_interval_days=review_outcome["old_interval_days"],
        new_interval_days=review_outcome["new_interval_days"],
        confidence=review_outcome["confidence"],
        next_review_date=review_outcome["next_review_date"],
        trigger_rebalance=review_outcome["trigger_rebalance"],
        ai_overall_summary=ai_overall_summary,
        rebalanced_timetable=rebalanced_impact,
        question_results=question_results
    )


@router.get("/timetable/{student_id}", response_model=TimetableAllocationImpact)
async def get_rebalanced_weekly_timetable(
    student_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieves the student's dynamic deficiency-driven weekly timetable allocation.
    Weekly Budget = daily_study_hours * 7.
    """
    student = await db.get(StudentProfile, student_id)
    if not student:
        raise HTTPException(status_code=404, detail=f"Student {student_id} not found")

    subject_masteries = await get_student_subject_masteries(db, student_id)
    daily_hours = float(student.daily_study_hours or 3.0)
    rebalanced = execute_rebalancing_pipeline(subject_masteries, daily_hours)

    return TimetableAllocationImpact(
        weekly_budget_hours=rebalanced["weekly_budget_hours"],
        daily_study_hours=rebalanced["daily_study_hours"],
        subject_masteries=rebalanced["subject_masteries"],
        deficiency_gaps=rebalanced["deficiency_gaps"],
        raw_weights=rebalanced["raw_weights"],
        normalized_weights=rebalanced["normalized_weights"],
        allocated_hours=rebalanced["allocated_hours"],
        allocated_minutes=rebalanced["allocated_minutes"]
    )


from .insights_service import get_student_analytics_dashboard, get_historical_assessment_review


@router.get("/analytics/{student_id}")
async def get_student_analytics(
    student_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Returns the complete 5-Zone Analytics Dashboard for a student (Zero New Tables).
    """
    student = await db.get(StudentProfile, student_id)
    if not student:
        raise HTTPException(status_code=404, detail=f"Student {student_id} not found")

    return await get_student_analytics_dashboard(db, student_id)


@router.get("/history/{assessment_id}/review-sheet")
async def get_assessment_historical_review(
    assessment_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieves full question-level review sheet with stored Groq AI feedback for any completed attempt.
    """
    review_data = await get_historical_assessment_review(db, assessment_id)
    if "error" in review_data:
        raise HTTPException(status_code=404, detail=review_data["error"])
    return review_data


@router.get("/backfill")
@router.post("/backfill")
async def backfill_assessment_telemetry(db: AsyncSession = Depends(get_db)):
    """
    Manually triggers the telemetry and count backfill for all xxed_user_assessment_data rows.
    """
    try:
        col_res = await db.execute(sa_text("SHOW COLUMNS FROM xxed_user_assessment_data"))
        existing_cols = {row[0] for row in col_res.fetchall()}

        set_clauses = []
        if "total_question" in existing_cols:
            set_clauses.append("uad.total_question = COALESCE(uad.total_question, ans.total_q, 10)")
        if "attempted_question" in existing_cols:
            set_clauses.append("uad.attempted_question = COALESCE(ans.att_q, 0)")
        if "un_attempted_question" in existing_cols:
            set_clauses.append("uad.un_attempted_question = COALESCE(ans.unatt_q, COALESCE(uad.total_question, 10) - COALESCE(ans.att_q, 0))")
        if "correct_count" in existing_cols:
            set_clauses.append("uad.correct_count = COALESCE(ans.corr_cnt, 0)")
        if "incorrect_count" in existing_cols:
            set_clauses.append("uad.incorrect_count = COALESCE(ans.incorr_cnt, 0)")
        if "time_taken" in existing_cols:
            set_clauses.append("uad.time_taken = COALESCE(uad.time_taken, ans.tot_time, 0)")
        if "percentage" in existing_cols:
            if "accuracy" in existing_cols:
                set_clauses.append("uad.percentage = COALESCE(uad.percentage, uad.accuracy, 0.0)")
            else:
                set_clauses.append("uad.percentage = COALESCE(uad.percentage, 0.0)")
        if "accuracy" in existing_cols:
            set_clauses.append("uad.accuracy = COALESCE(uad.accuracy, 0.0)")
        if "obtained_marks" in existing_cols:
            set_clauses.append("uad.obtained_marks = COALESCE(uad.obtained_marks, ans.tot_obt, 0.0)")
        if "total_marks" in existing_cols:
            set_clauses.append("uad.total_marks = COALESCE(uad.total_marks, ans.total_q, 10.0)")
        if "result_status" in existing_cols:
            set_clauses.append("uad.result_status = COALESCE(uad.result_status, 'IN_PROGRESS')")

        if not set_clauses:
            return {"status": "warning", "message": "No matching columns found to update"}

        sql = f"""
            UPDATE xxed_user_assessment_data uad
            LEFT JOIN (
                SELECT 
                    user_ass_id,
                    COUNT(*) AS total_q,
                    SUM(CASE WHEN user_answer IS NOT NULL AND user_answer != '' THEN 1 ELSE 0 END) AS att_q,
                    SUM(CASE WHEN user_answer IS NULL OR user_answer = '' THEN 1 ELSE 0 END) AS unatt_q,
                    SUM(CASE WHEN obtained_marks > 0 THEN 1 ELSE 0 END) AS corr_cnt,
                    SUM(CASE WHEN (user_answer IS NOT NULL AND user_answer != '') AND (obtained_marks IS NULL OR obtained_marks = 0) THEN 1 ELSE 0 END) AS incorr_cnt,
                    COALESCE(SUM(time_taken), 0) AS tot_time,
                    COALESCE(SUM(obtained_marks), 0) AS tot_obt
                FROM xxed_user_answer_data
                GROUP BY user_ass_id
            ) ans ON uad.user_ass_id = ans.user_ass_id
            SET {', '.join(set_clauses)}
        """

        await db.execute(sa_text(sql))
        await db.commit()
        return {
            "status": "success",
            "message": "Telemetry and summary counts backfilled successfully.",
            "updated_columns": [c.split('.')[1].split(' ')[0] for c in set_clauses]
        }
    except Exception as e:
        return {
            "status": "error",
            "error_details": str(e)
        }


# ============================================================================
# AuraStudy V1 Standardized GET Endpoints (Query-Parameter Based)
# ============================================================================

@v1_router.get("/chapter/pipeline")
async def get_chapter_pipeline_v1(
    chapter_id: int = Query(..., description="Chapter ID"),
    user_id: Optional[int] = Query(None, description="Student/User ID"),
    student_id: Optional[int] = Query(None, description="Legacy alias for user_id"),
    db: AsyncSession = Depends(get_db)
):
    """
    Standardized AuraStudy V1 GET endpoint for retrieving chapter 4-stage pipeline state.
    GET /api/v1/aurastudy/assessment/chapter/pipeline?chapter_id=1&user_id=123
    """
    uid = user_id if user_id is not None else student_id
    if uid is None:
        raise HTTPException(status_code=422, detail="Query parameter 'user_id' is required.")
    return await get_chapter_pipeline(chapter_id=chapter_id, student_id=uid, db=db)


@v1_router.get("/chapters/available")
async def get_available_chapters_for_assessment_v1(
    user_id: Optional[int] = Query(None, description="Student/User ID"),
    student_id: Optional[int] = Query(None, description="Legacy alias for user_id"),
    db: AsyncSession = Depends(get_db)
):
    """
    Standardized AuraStudy V1 GET endpoint for retrieving available chapters with progressive gating.
    GET /api/v1/aurastudy/assessment/chapters/available?user_id=123
    """
    uid = user_id if user_id is not None else student_id
    if uid is None:
        raise HTTPException(status_code=422, detail="Query parameter 'user_id' is required.")
    return await get_available_chapters_for_assessment(student_id=uid, db=db)


@v1_router.get("/dynamic-recall/completed")
async def get_completed_dynamic_recall_slots_v1(
    user_id: Optional[int] = Query(None, description="Student/User ID"),
    student_id: Optional[int] = Query(None, description="Legacy alias for user_id"),
    completed_date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format"),
    db: AsyncSession = Depends(get_db)
):
    """
    Standardized AuraStudy V1 GET endpoint for retrieving completed dynamic recall slots.
    GET /api/v1/aurastudy/assessment/dynamic-recall/completed?user_id=123&completed_date=2026-10-12
    """
    uid = user_id if user_id is not None else student_id
    if uid is None:
        raise HTTPException(status_code=422, detail="Query parameter 'user_id' is required.")
    return await get_completed_dynamic_recall_slots(student_id=uid, completed_date=completed_date, db=db)


@v1_router.get("/spaced-reviews/due", response_model=DueSpacedReviewsResponse)
async def list_due_spaced_reviews_v1(
    user_id: Optional[int] = Query(None, description="Student/User ID"),
    student_id: Optional[int] = Query(None, description="Legacy alias for user_id"),
    db: AsyncSession = Depends(get_db)
):
    """
    Standardized AuraStudy V1 GET endpoint for retrieving due spaced recall reviews.
    GET /api/v1/aurastudy/assessment/spaced-reviews/due?user_id=123
    """
    uid = user_id if user_id is not None else student_id
    if uid is None:
        raise HTTPException(status_code=422, detail="Query parameter 'user_id' is required.")
    return await list_due_spaced_reviews(student_id=uid, db=db)


@v1_router.get("/timetable", response_model=TimetableAllocationImpact)
async def get_rebalanced_weekly_timetable_v1(
    user_id: Optional[int] = Query(None, description="Student/User ID"),
    student_id: Optional[int] = Query(None, description="Legacy alias for user_id"),
    db: AsyncSession = Depends(get_db)
):
    """
    Standardized AuraStudy V1 GET endpoint for retrieving dynamic timetable allocation.
    GET /api/v1/aurastudy/assessment/timetable?user_id=123
    """
    uid = user_id if user_id is not None else student_id
    if uid is None:
        raise HTTPException(status_code=422, detail="Query parameter 'user_id' is required.")
    return await get_rebalanced_weekly_timetable(student_id=uid, db=db)


@v1_router.get("/analytics")
async def get_student_analytics_v1(
    user_id: Optional[int] = Query(None, description="Student/User ID"),
    student_id: Optional[int] = Query(None, description="Legacy alias for user_id"),
    db: AsyncSession = Depends(get_db)
):
    """
    Standardized AuraStudy V1 GET endpoint for retrieving the student analytics dashboard.
    GET /api/v1/aurastudy/assessment/analytics?user_id=123
    """
    uid = user_id if user_id is not None else student_id
    if uid is None:
        raise HTTPException(status_code=422, detail="Query parameter 'user_id' is required.")
    return await get_student_analytics(student_id=uid, db=db)


@v1_router.get("/history/review-sheet")
async def get_assessment_historical_review_v1(
    assessment_id: int = Query(..., description="Assessment attempt ID"),
    db: AsyncSession = Depends(get_db)
):
    """
    Standardized AuraStudy V1 GET endpoint for retrieving historical assessment review sheet.
    GET /api/v1/aurastudy/assessment/history/review-sheet?assessment_id=123
    """
    return await get_assessment_historical_review(assessment_id=assessment_id, db=db)


@v1_router.get("/backfill")
async def backfill_assessment_telemetry_v1(db: AsyncSession = Depends(get_db)):
    """
    Standardized AuraStudy V1 GET endpoint for backfilling telemetry.
    GET /api/v1/aurastudy/assessment/backfill
    """
    return await backfill_assessment_telemetry(db=db)



