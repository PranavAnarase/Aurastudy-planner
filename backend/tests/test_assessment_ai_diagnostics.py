"""
Unit & Integration Tests for Isolated Groq AI Diagnostic Explanations and Assessment Architecture.
"""

import pytest
import asyncio
from app.planner.rebalancer import compute_ema_mastery_40_60, calculate_raw_score
from app.progress.subject_criticality import SubjectCriticalityEngine
from app.assessment.ai_diagnostics import GroqAssessmentDiagnosticService
from app.assessment.models import (
    SubmitAssessmentResponse,
    MasteryUpdateDetails,
    TierActionDetails,
    TimetableAllocationImpact,
    QuestionReviewItem
)
from datetime import date


def test_40_60_ema_mastery_blending():
    # 1. First attempt: baseline = score
    first_score = compute_ema_mastery_40_60(80.0, None)
    assert first_score == 80.0

    # 2. Subsequent attempt: 0.60 * new + 0.40 * old
    # e.g., old = 50.0, new = 80.0 -> (0.6 * 80) + (0.4 * 50) = 48 + 20 = 68.0
    blended = compute_ema_mastery_40_60(80.0, 50.0)
    assert blended == 68.0


def test_option_a_subject_mastery_rollup():
    # Verify Option A rule: averages ONLY active/attempted chapters (not diluted by unattempted at 0%)
    chapters = [
        {"chapter_id": 1, "subject_name": "Geography", "chapter_number": 1},
        {"chapter_id": 2, "subject_name": "Geography", "chapter_number": 2},
        {"chapter_id": 3, "subject_name": "Geography", "chapter_number": 3},
        {"chapter_id": 4, "subject_name": "Geography", "chapter_number": 4},
    ]
    # Student attempted Chapter 1 (72.0%) and Chapter 2 (56.4%)
    masteries_map = {
        1: 72.0,
        2: 56.4,
        3: 0.0,
        4: 0.0
    }
    subj_masteries = SubjectCriticalityEngine.compute_subject_masteries(chapters, masteries_map)
    # Expected: (72.0 + 56.4) / 2 = 64.2%
    assert subj_masteries["Geography"] == 64.2


@pytest.mark.asyncio
async def test_ai_diagnostic_feedback_fallback():
    # Test heuristic fallback generation when Groq API key is empty
    sample_questions = [
        {
            "question_id": 101,
            "question_text": "What is 5 x (-3)?",
            "options": {"A": "15", "B": "-15", "C": "8", "D": "-8"},
            "selected_option": "A",
            "correct_option": "B",
            "is_correct": False,
            "explanation": "Product of positive and negative integer is always negative."
        },
        {
            "question_id": 102,
            "question_text": "Solve: -4 + 9",
            "options": {"A": "5", "B": "-5", "C": "13", "D": "-13"},
            "selected_option": "A",
            "correct_option": "A",
            "is_correct": True,
            "explanation": "Subtract the smaller absolute value from larger: 9 - 4 = 5."
        }
    ]

    result = await GroqAssessmentDiagnosticService.generate_diagnostic_feedback(
        subject_name="Mathematics",
        chapter_name="Integers",
        accuracy=50.0,
        obtained_marks=1.0,
        total_marks=2.0,
        questions_data=sample_questions
    )

    assert "ai_overall_summary" in result
    assert len(result["ai_overall_summary"]) > 10
    assert "question_diagnostics" in result
    q_map = result["question_diagnostics"]
    assert 101 in q_map
    assert 102 in q_map
    assert q_map[101]["ai_misconception_feedback"] is not None
    assert q_map[101]["ai_memory_tip"] is not None


def test_submit_assessment_response_serialization():
    # Test Pydantic model with new AI diagnostic fields
    item = QuestionReviewItem(
        question_id=1,
        question_text="Sample Q",
        difficulty="Easy",
        selected_option="B",
        correct_option="A",
        is_correct=False,
        explanation="Explanation here",
        time_taken_seconds=30,
        ai_concept_gap="Fractions Addition",
        ai_misconception_feedback="Adding denominators directly is incorrect.",
        ai_memory_tip="Find common denominator first!"
    )

    resp = SubmitAssessmentResponse(
        assessment_id=99,
        student_id=4,
        chapter_id=10,
        attempt_number=1,
        total_questions=1,
        obtained_marks=0.0,
        total_marks=1.0,
        accuracy=0.0,
        raw_score=0.0,
        ai_overall_summary="Review the fraction addition rules.",
        mastery_update=MasteryUpdateDetails(
            old_mastery=50.0,
            raw_score=0.0,
            updated_mastery=20.0,
            confidence="LOW",
            interval_days=1,
            next_review_date=date.today()
        ),
        tier_actions=TierActionDetails(
            tier="Critical",
            action_summary="Action summary",
            recommendation="Review basics",
            days_per_week="3-4",
            block_duration_minutes=45,
            unlock_next_chapter=False
        ),
        rebalanced_timetable=TimetableAllocationImpact(
            weekly_budget_hours=21.0,
            daily_study_hours=3.0,
            subject_masteries={"Mathematics": 20.0},
            deficiency_gaps={"Mathematics": 80.0},
            raw_weights={"Mathematics": 80.0},
            normalized_weights={"Mathematics": 1.0},
            allocated_hours={"Mathematics": 21.0},
            allocated_minutes={"Mathematics": 1260}
        ),
        question_results=[item]
    )

@pytest.mark.asyncio
async def test_groq_feedback_service_interface():
    from app.assessment.groq_feedback_service import generate_assessment_ai_feedback
    incorrect_items = [
        {
            "question_id": 201,
            "question_text": "Which of these is a material source of history?",
            "options": {"A": "Biographies", "B": "Coins", "C": "Folk songs", "D": "Letters"},
            "selected_option": "A",
            "selected_option_text": "Biographies",
            "correct_option": "B",
            "correct_option_text": "Coins",
            "explanation": "Coins are physical artifacts and hence Material Sources."
        }
    ]

    res = await generate_assessment_ai_feedback(
        subject_name="History & Civics",
        chapter_title="Sources of History",
        score_percentage=0.0,
        incorrect_items=incorrect_items
    )

    assert "overallSummary" in res
    assert "diagnoses" in res
    assert len(res["diagnoses"]) == 1
    d = res["diagnoses"][0]
    assert d["questionId"] == 201
    assert d["conceptGap"] is not None
    assert d["misconceptionExplanation"] is not None
    assert d["memoryTip"] is not None


if __name__ == "__main__":
    test_40_60_ema_mastery_blending()
    print("✓ test_40_60_ema_mastery_blending PASSED")
    test_option_a_subject_mastery_rollup()
    print("✓ test_option_a_subject_mastery_rollup PASSED")
    asyncio.run(test_ai_diagnostic_feedback_fallback())
    print("✓ test_ai_diagnostic_feedback_fallback PASSED")
    asyncio.run(test_groq_feedback_service_interface())
    print("✓ test_groq_feedback_service_interface PASSED")
    test_submit_assessment_response_serialization()
    print("✓ test_submit_assessment_response_serialization PASSED")
    print("\nALL AI DIAGNOSTIC & CONTRASTIVE TESTS PASSED SUCCESSFULLY!")


