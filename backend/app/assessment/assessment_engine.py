"""
Assessment Generation Engine.
Assembles chapter internal assessments (10-15 MCQs with 40% Easy, 40% Average, 20% Difficult)
and 5-question Spaced Recall Quizzes with 60s/question timing.
"""

from typing import List, Dict
import random
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.academic_question import AcademicQuestion
from app.models.chapter_question_bank import ChapterQuestionBank
from app.models.chapter_assessment import (
    ChapterAssessment,
    AssessmentStatusEnum,
    AssessmentTypeEnum
)


def compute_difficulty_counts(total_questions: int) -> Dict[str, int]:
    """
    Computes exact distribution for N questions:
    40% Easy, 40% Average, 20% Difficult.
    """
    easy_count = int(round(0.40 * total_questions))
    avg_count = int(round(0.40 * total_questions))
    diff_count = total_questions - (easy_count + avg_count)
    return {
        "Easy": easy_count,
        "Average": avg_count,
        "Difficult": diff_count
    }


async def assemble_chapter_assessment(
    session: AsyncSession,
    student_id: int,
    chapter_id: int,
    total_questions: int = 10,
    assessment_type: AssessmentTypeEnum = AssessmentTypeEnum.CHAPTER_TEST
) -> ChapterAssessment:
    """
    Selects balanced academic questions from chapter_question_bank (or academic_questions)
    and creates a ChapterAssessment record in DB.
    """
    if assessment_type == AssessmentTypeEnum.SPACED_REVIEW:
        total_questions = 5
        difficulty_target = {"Easy": 2, "Average": 2, "Difficult": 1}
    else:
        total_questions = max(10, min(15, total_questions))
        difficulty_target = compute_difficulty_counts(total_questions)

    # 1. Fetch available academic questions strictly for this chapter from xxed_academic_question_tab
    stmt_aq = select(AcademicQuestion).where(
        AcademicQuestion.chapter_id == chapter_id,
        AcademicQuestion.is_active == True
    )
    res_aq = await session.execute(stmt_aq)
    all_questions = list(res_aq.scalars().all())

    if not all_questions:
        raise ValueError(f"No academic questions found for chapter_id={chapter_id}")

    by_difficulty: Dict[str, List[AcademicQuestion]] = {
        "Easy": [],
        "Average": [],
        "Difficult": []
    }
    for q in all_questions:
        diff_key = q.difficulty.value if hasattr(q.difficulty, 'value') else str(q.difficulty or 'Average')
        if diff_key in by_difficulty:
            by_difficulty[diff_key].append(q)
        else:
            by_difficulty["Average"].append(q)

    # 2. Pick target number of questions per difficulty
    selected_questions: List[AcademicQuestion] = []
    
    for diff, target_num in difficulty_target.items():
        pool = list(by_difficulty[diff])
        random.shuffle(pool)
        picked = pool[:target_num]
        selected_questions.extend(picked)

    # If some difficulty buckets lacked sufficient questions, backfill from remaining pool
    if len(selected_questions) < total_questions:
        picked_ids = {q.question_id for q in selected_questions}
        remaining_pool = [q for q in all_questions if q.question_id not in picked_ids]
        random.shuffle(remaining_pool)
        needed = total_questions - len(selected_questions)
        selected_questions.extend(remaining_pool[:needed])

    # Shuffle final questions
    random.shuffle(selected_questions)
    
    # 3. Determine attempt number for this student & chapter
    #    ChapterAssessment maps to xxed_user_assessment_data which links to
    #    xxed_assessments_tab via assessment_id; chapter_id is on the template.
    from sqlalchemy import text as sa_text
    count_res = await session.execute(
        sa_text("""
            SELECT COUNT(*) FROM xxed_user_assessment_data uad
            JOIN xxed_assessments_tab at2 ON uad.assessment_id = at2.assessment_id
            WHERE uad.user_id = :uid AND at2.chapter_id = :cid
        """),
        {"uid": student_id, "cid": chapter_id}
    )
    prior_attempts = count_res.scalar() or 0
    attempt_number = prior_attempts + 1

    total_marks = sum(q.marks or 1 for q in selected_questions)

    # Look up or create a template assessment_id for this chapter
    tmpl_res = await session.execute(
        sa_text("""
            SELECT assessment_id FROM xxed_assessments_tab
            WHERE chapter_id = :cid AND assessment_level_name = 'CHAPTER'
            LIMIT 1
        """),
        {"cid": chapter_id}
    )
    tmpl_row = tmpl_res.fetchone()
    if tmpl_row:
        template_id = tmpl_row[0]
    else:
        # Create a template assessment record for this chapter and retrieve its new ID
        ins_res = await session.execute(
            sa_text("""
                INSERT INTO xxed_assessments_tab (
                    assessment_name, assessment_level_name,
                    total_question, total_marks, course_id, chapter_id,
                    content_category_id, content_type_id
                ) VALUES (
                    :name, 'CHAPTER', :tq, :tm, 1, :cid, 2, 6
                )
            """),
            {
                "name": f"Chapter Assessment Ch {chapter_id}",
                "tq": len(selected_questions),
                "tm": float(total_marks),
                "cid": chapter_id
            }
        )
        # Use lastrowid from the raw cursor result (most reliable across drivers)
        template_id = ins_res.lastrowid
        if not template_id:
            # Fallback: SELECT LAST_INSERT_ID()
            id_res = await session.execute(sa_text("SELECT LAST_INSERT_ID()"))
            template_id = id_res.scalar()
        if not template_id:
            # Final fallback: re-query by chapter_id
            tmpl_res3 = await session.execute(
                sa_text("""
                    SELECT assessment_id FROM xxed_assessments_tab
                    WHERE chapter_id = :cid AND assessment_level_name = 'CHAPTER'
                    ORDER BY assessment_id DESC LIMIT 1
                """),
                {"cid": chapter_id}
            )
            template_id = tmpl_res3.scalar()

    # 4. Create ChapterAssessment and Items
    assessment = ChapterAssessment(
        student_id=student_id,
        template_assessment_id=template_id,
        attempt_number=attempt_number,
        total_questions=len(selected_questions),
        total_marks=total_marks,
        obtained_marks=0.0,
        accuracy=0.0,
        percentage=0.0,
        attempted_question=0,
        un_attempted_question=len(selected_questions),
        correct_count=0,
        incorrect_count=0,
        time_taken=0,
        status=AssessmentStatusEnum.IN_PROGRESS
    )
    session.add(assessment)
    await session.flush()

    for idx, q in enumerate(selected_questions, start=1):
        await session.execute(
            sa_text("""
                INSERT INTO xxed_user_answer_data (
                    user_id, user_ass_id, academic_question_id,
                    content_type_id, time_taken, attempt_status
                ) VALUES (
                    :uid, :aid, :qid, 6, :qorder, 'NOT_ANSWERED'
                )
            """),
            {
                "uid": student_id,
                "aid": assessment.assessment_id,
                "qid": q.question_id,
                "qorder": idx
            }
        )

    await session.commit()
    await session.refresh(assessment)
    return assessment
