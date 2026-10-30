"""
Student Assessment Analytics & Performance Insights Service for Standard 7.
Aggregates assessment logs, Option A subject mastery, score timeline trends,
and detailed review logs with zero new database tables.
"""

from typing import Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select
from app.models.chapter_assessment import ChapterAssessmentResponse
from app.models.academic_question import AcademicQuestion
from app.models.chapter_question_bank import ChapterQuestionBank
from app.progress.subject_criticality import STANDARD_7_SUBJECTS, SubjectCriticalityEngine


async def get_student_analytics_dashboard(session: AsyncSession, student_id: int) -> Dict[str, Any]:
    """
    Synthesizes the complete 5-Zone Analytics Dashboard for a student.
    """
    # 1. Fetch KPI Summary Metrics
    kpi_query = await session.execute(
        text("""
            SELECT 
                COUNT(DISTINCT ca.user_ass_id) as total_tests,
                COALESCE(AVG(ca.accuracy), 0) as avg_accuracy,
                COALESCE(AVG(car.time_taken), 0) as avg_speed_sec
            FROM xxed_user_assessment_data ca
            LEFT JOIN xxed_user_answer_data car ON ca.user_ass_id = car.user_ass_id
            WHERE ca.user_id = :sid AND ca.result_status = 'COMPLETED'
        """),
        {"sid": student_id}
    )
    kpi_row = kpi_query.fetchone()
    total_tests = int(kpi_row.total_tests) if kpi_row and kpi_row.total_tests else 0
    avg_accuracy = float(kpi_row.avg_accuracy) if kpi_row and kpi_row.avg_accuracy is not None else 0.0
    avg_speed = float(kpi_row.avg_speed_sec) if kpi_row and kpi_row.avg_speed_sec is not None else 0.0

    # Count mastered chapters (mastery_score >= 90.0)
    mastered_query = await session.execute(
        text("""
            SELECT COUNT(*) as cnt 
            FROM xxed_chapter_mastery_tab 
            WHERE user_id = :sid AND mastery_score >= 90.0
        """),
        {"sid": student_id}
    )
    mastered_row = mastered_query.fetchone()
    mastered_count = int(mastered_row.cnt) if mastered_row and mastered_row.cnt else 0

    # 2. Score Progression Timeline (Chronological tests with speed and telemetry)
    timeline_query = await session.execute(
        text("""
            SELECT 
                ca.user_ass_id as assessment_id,
                COALESCE(ca.ass_end_time, ca.ass_start_time, CURRENT_TIMESTAMP) as test_date,
                ca.accuracy as score_percentage,
                ca.obtained_marks,
                ca.total_marks,
                ca.attempt_count as attempt_number,
                c.chapter_name,
                s.subject_name,
                COALESCE(AVG(car.time_taken), 0) as avg_speed_sec
            FROM xxed_user_assessment_data ca
            JOIN xxed_assessments_tab at2 ON ca.assessment_id = at2.assessment_id
            JOIN xxed_chapters_data c ON at2.chapter_id = c.chapter_id
            JOIN xxed_subjects_data s ON c.subject_id = s.subject_id
            LEFT JOIN xxed_user_answer_data car ON ca.user_ass_id = car.user_ass_id
            WHERE ca.user_id = :sid AND ca.result_status = 'COMPLETED'
            GROUP BY ca.user_ass_id, ca.ass_end_time, ca.ass_start_time, ca.accuracy, 
                     ca.obtained_marks, ca.total_marks, ca.attempt_count, c.chapter_name, s.subject_name
            ORDER BY COALESCE(ca.ass_end_time, ca.ass_start_time) ASC
            LIMIT 150
        """),
        {"sid": student_id}
    )
    timeline_rows = timeline_query.fetchall()

    timeline_points = []
    for r in timeline_rows:
        t_date = r.test_date
        iso_str = t_date.isoformat() if hasattr(t_date, "isoformat") else str(t_date)
        date_short = t_date.strftime("%Y-%m-%d") if hasattr(t_date, "strftime") else str(t_date)
        date_full = t_date.strftime("%Y-%m-%d %H:%M") if hasattr(t_date, "strftime") else str(t_date)
        score_val = float(r.score_percentage) if r.score_percentage is not None else 0.0
        tier_val = "MASTERED" if score_val >= 90 else ("DEVELOPING" if score_val >= 50 else "CRITICAL")
        
        timeline_points.append({
            "assessmentId": r.assessment_id,
            "assessment_id": r.assessment_id,
            "test_date": iso_str,
            "date": date_short,
            "fullDate": date_full,
            "score": round(score_val, 1),
            "obtainedMarks": float(r.obtained_marks or 0),
            "totalMarks": float(r.total_marks or 0),
            "attemptNumber": int(r.attempt_number or 1),
            "subject": r.subject_name,
            "subjectName": r.subject_name,
            "chapter": r.chapter_name,
            "chapterTitle": r.chapter_name,
            "avgSpeedSeconds": round(float(r.avg_speed_sec or 0), 1),
            "tier": tier_val,
            "label": f"{r.subject_name}: {r.chapter_name}"
        })

    # Derive momentum and summary insights
    scores = [p["score"] for p in timeline_points]
    recent_5_avg = round(sum(scores[-5:]) / len(scores[-5:]), 1) if scores else 0.0
    consistency_rate = round((sum(1 for s in scores if s >= 50.0) / max(len(scores), 1)) * 100, 1)

    delta = 0.0
    trend_type = "NEUTRAL"
    trend_insight = "Take your first chapter tests to see your learning score journey unfold here!"

    if len(scores) >= 4:
        half = len(scores) // 2
        first_half_avg = sum(scores[:half]) / half
        second_half_avg = sum(scores[half:]) / (len(scores) - half)
        delta = round(second_half_avg - first_half_avg, 1)
        if delta > 2.0:
            trend_type = "UPWARD"
            trend_insight = f"🚀 Great momentum! Your recent scores are averaging +{delta}% higher than your earlier attempts."
        elif delta < -2.0:
            trend_type = "DOWNWARD"
            trend_insight = f"💪 Review recommended: scores dipped by {abs(delta)}%. Revisit active recall flashcards before your next test."
        else:
            trend_type = "STEADY"
            trend_insight = "⚖️ Steady retention! Maintain consistency and aim to break past the 90% Mastered benchmark."
    elif len(scores) > 0:
        latest = scores[-1]
        if latest >= 90.0:
            trend_type = "UPWARD"
            trend_insight = f"🌟 Stellar start! You achieved {latest}% on your latest test. Keep up the high mastery!"
        elif latest >= 50.0:
            trend_type = "STEADY"
            trend_insight = f"🎯 Solid start! Scored {latest}% on your recent test. Keep building consistency."
        else:
            trend_type = "DOWNWARD"
            trend_insight = f"💡 Keep working! Review the question explanations to turn difficult concepts into strengths."

    # Next milestone recommendation
    if recent_5_avg >= 90.0:
        next_milestone = "🏆 High Mastery achieved! Maintain this consistency across upcoming chapters."
    elif recent_5_avg >= 75.0:
        next_milestone = "🎯 Push for 90%+ on your next 2 chapter assessments to reach High Mastery tier."
    elif recent_5_avg >= 50.0:
        next_milestone = "📚 Solid foundation! Practice active recall flashcards to break into the 80%+ bracket."
    elif scores:
        next_milestone = "⚡ Complete concept study & practice drills to build passing consistency above 50%."
    else:
        next_milestone = "🎯 Complete your first chapter assessment to unlock your personalized learning trajectory."

    score_timeline_payload = {
        "data": timeline_points,
        "points": timeline_points,
        "insightText": trend_insight,
        "summary": {
            "recent5Average": recent_5_avg,
            "consistencyRate": consistency_rate,
            "trajectoryDelta": delta,
            "trendType": trend_type,
            "totalTestsPlotted": len(timeline_points),
            "nextMilestone": next_milestone
        }
    }


    # 3. Option A Subject-Wise Active Mastery (Active / Attempted Chapters Only)
    subject_query = await session.execute(
        text("""
            SELECT 
                s.subject_id,
                s.subject_name,
                AVG(cm.mastery_score) as active_subject_mastery,
                COUNT(cm.chapter_id) as active_chapters
            FROM xxed_subjects_data s
            JOIN xxed_chapters_data c ON s.subject_id = c.subject_id
            JOIN xxed_chapter_mastery_tab cm ON c.chapter_id = cm.chapter_id
            WHERE cm.user_id = :sid 
              AND (cm.xxed_concept_completed = 1 OR cm.xxed_practice_completed = 1 OR cm.mastery_score > 0)
            GROUP BY s.subject_id, s.subject_name
        """),
        {"sid": student_id}
    )
    subject_rows = subject_query.fetchall()

    subject_mastery_map = {}
    for s in subject_rows:
        canon_name = SubjectCriticalityEngine.normalize_subject_name(s.subject_name)
        score_val = float(s.active_subject_mastery) if s.active_subject_mastery is not None else 0.0
        subject_mastery_map[canon_name] = {
            "subjectId": s.subject_id,
            "subjectName": canon_name,
            "masteryScore": round(score_val, 1),
            "activeChaptersCount": int(s.active_chapters),
            "tier": "Mastered" if score_val >= 90 else ("Developing" if score_val >= 50 else "Needs Focus")
        }

    # Ensure all 7 canonical Standard 7 subjects are represented
    subject_mastery_data = []
    for subj in STANDARD_7_SUBJECTS:
        if subj in subject_mastery_map:
            subject_mastery_data.append(subject_mastery_map[subj])
        else:
            subject_mastery_data.append({
                "subjectId": 0,
                "subjectName": subj,
                "masteryScore": 0.0,
                "activeChaptersCount": 0,
                "tier": "Unattempted"
            })

    # Dynamic Insight for Subject Balance
    subject_insight = "Start attempting assessments across your subjects to see your subject power wheel balance out."
    active_subjects = [s for s in subject_mastery_data if s["activeChaptersCount"] > 0]
    if active_subjects:
        sorted_subs = sorted(active_subjects, key=lambda x: x["masteryScore"], reverse=True)
        strongest = sorted_subs[0]
        weakest = sorted_subs[-1]
        if strongest["subjectName"] != weakest["subjectName"]:
            subject_insight = f"💡 {strongest['subjectName']} is your highest scoring subject ({strongest['masteryScore']}%), while {weakest['subjectName']} ({weakest['masteryScore']}%) is receiving focused study sessions in your weekly timetable."
        else:
            subject_insight = f"🌟 You are actively building mastery in {strongest['subjectName']} ({strongest['masteryScore']}%)."

    # 4. Top Strengths & Focus Priority Chapters
    chapter_query = await session.execute(
        text("""
            SELECT 
                c.chapter_id,
                c.chapter_name,
                s.subject_name,
                cm.mastery_score
            FROM xxed_chapter_mastery_tab cm
            JOIN xxed_chapters_data c ON cm.chapter_id = c.chapter_id
            JOIN xxed_subjects_data s ON c.subject_id = s.subject_id
            WHERE cm.user_id = :sid 
              AND (cm.xxed_concept_completed = 1 OR cm.xxed_practice_completed = 1 OR cm.mastery_score > 0)
            ORDER BY cm.mastery_score DESC
        """),
        {"sid": student_id}
    )
    chapter_rows = chapter_query.fetchall()

    top_strengths = [
        {
            "chapterId": c.chapter_id,
            "title": c.chapter_name,
            "subject": c.subject_name,
            "mastery": round(float(c.mastery_score), 1)
        }
        for c in chapter_rows if float(c.mastery_score) >= 50.0
    ][:3]

    focus_priorities = [
        {
            "chapterId": c.chapter_id,
            "title": c.chapter_name,
            "subject": c.subject_name,
            "mastery": round(float(c.mastery_score), 1)
        }
        for c in reversed(chapter_rows) if float(c.mastery_score) < 50.0
    ][:3]

    # 5. Assessment History Logs
    history_query = await session.execute(
        text("""
            SELECT 
                ca.user_ass_id as assessment_id,
                ca.attempt_count as attempt_number,
                ca.obtained_marks,
                ca.total_marks,
                ca.accuracy,
                COALESCE(ca.ass_end_time, ca.ass_start_time, CURRENT_TIMESTAMP) as test_date,
                NULL as ai_overall_summary,
                c.chapter_name,
                s.subject_name
            FROM xxed_user_assessment_data ca
            JOIN xxed_assessments_tab at2 ON ca.assessment_id = at2.assessment_id
            JOIN xxed_chapters_data c ON at2.chapter_id = c.chapter_id
            JOIN xxed_subjects_data s ON c.subject_id = s.subject_id
            WHERE ca.user_id = :sid AND ca.result_status = 'COMPLETED'
            ORDER BY COALESCE(ca.ass_end_time, ca.ass_start_time) DESC
            LIMIT 50
        """),
        {"sid": student_id}
    )
    history_rows = history_query.fetchall()

    assessment_history = []
    for h in history_rows:
        t_date = h.test_date
        iso_str = t_date.isoformat() if hasattr(t_date, "isoformat") else str(t_date)
        date_str = t_date.strftime("%Y-%m-%d %H:%M") if hasattr(t_date, "strftime") else str(t_date)
        acc = float(h.accuracy) if h.accuracy is not None else 0.0
        tier = "Mastered" if acc >= 90 else ("Developing" if acc >= 50 else "Critical")
        assessment_history.append({
            "assessmentId": h.assessment_id,
            "assessment_id": h.assessment_id,
            "test_date": iso_str,
            "dateFormatted": date_str,
            "subjectName": h.subject_name,
            "chapterTitle": h.chapter_name,
            "attemptNumber": h.attempt_number,
            "obtained_marks": float(h.obtained_marks or 0),
            "total_marks": float(h.total_marks or 0),
            "scoreFormatted": f"{float(h.obtained_marks or 0):.0f} / {float(h.total_marks or 0):.0f}",
            "accuracy": round(acc, 1),
            "tierBadge": tier,
            "aiOverallSummary": h.ai_overall_summary
        })

    return {
        "kpis": {
            "totalAssessments": total_tests,
            "overallAccuracy": round(avg_accuracy, 1),
            "masteredChaptersCount": mastered_count,
            "averageSpeedSeconds": round(avg_speed, 1)
        },
        "charts": {
            "scoreTimeline": score_timeline_payload,
            "subjectMastery": {

                "data": subject_mastery_data,
                "insightText": subject_insight
            }
        },
        "diagnostics": {
            "topStrengths": top_strengths,
            "focusPriorities": focus_priorities
        },
        "history": assessment_history
    }


async def get_historical_assessment_review(session: AsyncSession, assessment_id: int) -> Dict[str, Any]:
    """
    Retrieves full question-level review sheet for a completed assessment attempt.
    """
    # 1. Fetch attempt record (join through xxed_assessments_tab to get chapter_id)
    from sqlalchemy import text as sa_text
    stmt_a = sa_text("""
        SELECT uad.user_ass_id, uad.user_id, uad.assessment_id as template_id,
               uad.attempt_count, uad.total_question, uad.obtained_marks, uad.total_marks,
               uad.accuracy, uad.result_status, uad.ass_start_time, uad.ass_end_time,
               at2.chapter_id, c.chapter_name, s.subject_name
        FROM xxed_user_assessment_data uad
        JOIN xxed_assessments_tab at2 ON uad.assessment_id = at2.assessment_id
        JOIN xxed_chapters_data c ON at2.chapter_id = c.chapter_id
        JOIN xxed_subjects_data s ON c.subject_id = s.subject_id
        WHERE uad.user_ass_id = :aid
        LIMIT 1
    """)
    res_a = await session.execute(stmt_a, {"aid": assessment_id})
    row_a = res_a.fetchone()
    if not row_a:
        return {"error": "Assessment not found", "questions": []}

    # Build a simple namespace for downstream access
    class _Assess:
        assessment_id = row_a.user_ass_id
        student_id = row_a.user_id
        attempt_number = row_a.attempt_count
        total_questions = row_a.total_question
        obtained_marks = row_a.obtained_marks
        total_marks = row_a.total_marks
        accuracy = row_a.accuracy
        status_str = row_a.result_status

    assessment = _Assess()
    chapter_name = row_a.chapter_name
    subject_name = row_a.subject_name

    # 2. Fetch responses
    stmt_resp = (
        select(ChapterAssessmentResponse)
        .where(ChapterAssessmentResponse.assessment_id == assessment_id)
        .order_by(ChapterAssessmentResponse.response_id.asc())
    )
    res_resp = await session.execute(stmt_resp)
    responses = list(res_resp.scalars().all())

    # 3. Fetch questions mapping
    question_ids = [r.question_id for r in responses]
    qb_map = {}

    if question_ids:
        # Check chapter_question_bank
        try:
            stmt_qb = select(ChapterQuestionBank).where(ChapterQuestionBank.chapter_question_id.in_(question_ids))
            res_qb = await session.execute(stmt_qb)
            for q in res_qb.scalars().all():
                qb_map[q.chapter_question_id] = q
        except Exception:
            pass

        # Backfill from academic_questions
        missing = [qid for qid in question_ids if qid not in qb_map]
        if missing:
            try:
                stmt_aq = select(AcademicQuestion).where(AcademicQuestion.question_id.in_(missing))
                res_aq = await session.execute(stmt_aq)
                for q in res_aq.scalars().all():
                    qb_map[q.question_id] = q
            except Exception:
                pass

    question_items = []
    for r in responses:
        q_obj = qb_map.get(r.question_id)
        q_text = q_obj.question_text if q_obj else f"Question #{r.question_id}"
        opt_a = getattr(q_obj, 'option_a', None)
        opt_b = getattr(q_obj, 'option_b', None)
        opt_c = getattr(q_obj, 'option_c', None)
        opt_d = getattr(q_obj, 'option_d', None)
        corr_opt = getattr(q_obj, 'correct_option', 'A')
        explanation = getattr(q_obj, 'explanation', None)

        question_items.append({
            "questionId": r.question_id,
            "questionText": q_text,
            "options": {
                "A": opt_a,
                "B": opt_b,
                "C": opt_c,
                "D": opt_d
            },
            "selectedOption": r.selected_option,
            "correctOption": corr_opt,
            "isCorrect": bool(r.is_correct),
            "timeTaken": r.time_taken_seconds or 0,
            "standardExplanation": explanation,
            "aiFeedback": {
                "conceptGap": r.ai_concept_gap,
                "misconceptionExplanation": r.ai_misconception_feedback,
                "memoryTip": r.ai_memory_tip
            } if r.ai_misconception_feedback or r.ai_concept_gap or r.ai_memory_tip else None
        })

    t_date = row_a.ass_end_time or row_a.ass_start_time
    iso_str = t_date.isoformat() if hasattr(t_date, "isoformat") else (str(t_date) if t_date else "")
    date_str = t_date.strftime("%Y-%m-%d %H:%M") if hasattr(t_date, "strftime") else (str(t_date) if t_date else "")

    return {
        "assessmentId": assessment.assessment_id,
        "assessment_id": assessment.assessment_id,
        "test_date": iso_str,
        "studentId": assessment.student_id,
        "student_id": assessment.student_id,
        "chapterId": row_a.chapter_id,
        "chapter_id": row_a.chapter_id,
        "chapterTitle": chapter_name,
        "chapter_title": chapter_name,
        "subjectName": subject_name,
        "subject_name": subject_name,
        "attemptNumber": assessment.attempt_number,
        "attempt_number": assessment.attempt_number,
        "score": float(assessment.obtained_marks or 0),
        "obtained_marks": float(assessment.obtained_marks or 0),
        "totalMarks": float(assessment.total_marks or len(question_items)),
        "total_marks": float(assessment.total_marks or len(question_items)),
        "accuracy": float(assessment.accuracy or 0),
        "dateFormatted": date_str,
        "aiOverallSummary": None,
        "ai_overall_summary": None,
        "questions": question_items
    }
