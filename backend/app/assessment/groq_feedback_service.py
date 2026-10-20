"""
Enhanced Groq AI Assessment Feedback Service.
Provides high-depth contrastive feedback, micro-concept gaps, and memory formulas.
"""

from typing import List, Dict, Any
from app.assessment.ai_diagnostics import (
    GroqAssessmentDiagnosticService
)


async def generate_assessment_ai_feedback(
    subject_name: str,
    chapter_title: str,
    score_percentage: float,
    incorrect_items: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Standard interface for generating Groq AI feedback for missed questions.
    """
    # Transform incorrect_items into questions_data format
    questions_data = []
    for item in incorrect_items:
        questions_data.append({
            "question_id": item.get("question_id") or item.get("questionId"),
            "question_text": item.get("question_text") or item.get("questionText", ""),
            "options": item.get("options", {}),
            "selected_option": item.get("selected_option") or item.get("studentChoiceLetter"),
            "selected_option_text": item.get("selected_option_text") or item.get("studentChoiceText"),
            "correct_option": item.get("correct_option") or item.get("correctChoiceLetter"),
            "correct_option_text": item.get("correct_option_text") or item.get("correctChoiceText"),
            "is_correct": False,
            "explanation": item.get("explanation") or item.get("standardExplanation", "")
        })

    total = len(questions_data)
    result = await GroqAssessmentDiagnosticService.generate_diagnostic_feedback(
        subject_name=subject_name,
        chapter_name=chapter_title,
        accuracy=score_percentage,
        obtained_marks=0.0,
        total_marks=float(max(1, total)),
        questions_data=questions_data
    )

    diagnoses = []
    for q in questions_data:
        qid = q["question_id"]
        diag = result.get("question_diagnostics", {}).get(qid, {})
        diagnoses.append({
            "questionId": qid,
            "conceptGap": diag.get("ai_concept_gap"),
            "misconceptionExplanation": diag.get("ai_misconception_feedback"),
            "memoryTip": diag.get("ai_memory_tip")
        })

    return {
        "overallSummary": result.get("ai_overall_summary"),
        "diagnoses": diagnoses
    }
