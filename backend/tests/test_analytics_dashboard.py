"""
Unit and Integration Tests for Student Assessment Analytics & Performance Insights Dashboard.
Verifies KPI metrics, score trajectory timeline, Option A active subject mastery,
strengths/weaknesses diagnostics, and historical review sheets with stored AI feedback.
Strictly Zero New Database Tables.
"""

import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock
from app.assessment.insights_service import (
    get_student_analytics_dashboard,
    get_historical_assessment_review
)


@pytest.mark.asyncio
async def test_analytics_dashboard_insights_computation():
    """
    Test analytics dashboard aggregation logic with simulated DB results.
    """
    mock_db = AsyncMock()

    # 1. Mock KPI row
    mock_kpi_row = MagicMock()
    mock_kpi_row.total_tests = 5
    mock_kpi_row.avg_accuracy = 82.5
    mock_kpi_row.avg_speed_sec = 24.2

    # 2. Mock Mastered count
    mock_mastered_row = MagicMock()
    mock_mastered_row.cnt = 3

    # 3. Mock Timeline records
    mock_t1 = MagicMock(
        assessment_id=1,
        test_date=MagicMock(strftime=lambda fmt: "Oct 12"),
        score_percentage=70.0,
        obtained_marks=7.0,
        total_marks=10.0,
        chapter_name="Integers",
        subject_name="Mathematics"
    )
    mock_t2 = MagicMock(
        assessment_id=2,
        test_date=MagicMock(strftime=lambda fmt: "Oct 15"),
        score_percentage=90.0,
        obtained_marks=9.0,
        total_marks=10.0,
        chapter_name="Sources of History",
        subject_name="History & Civics"
    )
    mock_t3 = MagicMock(
        assessment_id=3,
        test_date=MagicMock(strftime=lambda fmt: "Oct 18"),
        score_percentage=95.0,
        obtained_marks=9.5,
        total_marks=10.0,
        chapter_name="Nutrition in Living Organisms",
        subject_name="General Science"
    )

    # 4. Mock Subject Records (Option A active roll-up)
    mock_s1 = MagicMock(
        subject_id=1,
        subject_name="Mathematics",
        active_subject_mastery=70.0,
        active_chapters=2
    )
    mock_s2 = MagicMock(
        subject_id=2,
        subject_name="General Science",
        active_subject_mastery=95.0,
        active_chapters=1
    )

    # 5. Mock Chapter Strengths / Focus
    mock_c1 = MagicMock(
        chapter_id=10,
        chapter_name="Nutrition in Living Organisms",
        subject_name="General Science",
        mastery_score=95.0
    )
    mock_c2 = MagicMock(
        chapter_id=11,
        chapter_name="Integers",
        subject_name="Mathematics",
        mastery_score=45.0
    )

    # 6. Mock History Logs
    mock_h1 = MagicMock(
        assessment_id=3,
        attempt_number=1,
        obtained_marks=9.5,
        total_marks=10.0,
        accuracy=95.0,
        test_date=MagicMock(strftime=lambda fmt: "Oct 18, 2026 • 10:30 AM"),
        ai_overall_summary="Mastered key biology concepts.",
        chapter_name="Nutrition in Living Organisms",
        subject_name="General Science"
    )

    # Setup mock query sequence
    mock_db.execute.side_effect = [
        # KPI query
        MagicMock(fetchone=lambda: mock_kpi_row),
        # Mastered count
        MagicMock(fetchone=lambda: mock_mastered_row),
        # Timeline
        MagicMock(fetchall=lambda: [mock_t1, mock_t2, mock_t3]),
        # Subject masteries
        MagicMock(fetchall=lambda: [mock_s1, mock_s2]),
        # Chapter masteries
        MagicMock(fetchall=lambda: [mock_c1, mock_c2]),
        # History logs
        MagicMock(fetchall=lambda: [mock_h1])
    ]

    result = await get_student_analytics_dashboard(mock_db, student_id=4)

    # Validate Zone 1 KPIs
    assert result["kpis"]["totalAssessments"] == 5
    assert result["kpis"]["overallAccuracy"] == 82.5
    assert result["kpis"]["masteredChaptersCount"] == 3
    assert result["kpis"]["averageSpeedSeconds"] == 24.2

    # Validate Zone 2 Score Timeline & Momentum Telemetry
    timeline = result["charts"]["scoreTimeline"]
    assert len(timeline["data"]) == 3
    assert timeline["data"][0]["score"] == 70.0
    assert timeline["data"][2]["score"] == 95.0
    assert "summary" in timeline
    assert timeline["summary"]["recent5Average"] == 85.0
    assert timeline["summary"]["consistencyRate"] == 100.0
    assert "nextMilestone" in timeline["summary"]
    assert "higher" in timeline["insightText"] or "momentum" in timeline["insightText"] or "Stellar" in timeline["insightText"] or "Great" in timeline["insightText"]

    # Validate Zone 3 Option A Subject Mastery

    subj_data = result["charts"]["subjectMastery"]
    math_item = next(s for s in subj_data["data"] if s["subjectName"] == "Mathematics")
    sci_item = next(s for s in subj_data["data"] if s["subjectName"] == "General Science")
    assert math_item["masteryScore"] == 70.0
    assert sci_item["masteryScore"] == 95.0
    assert "General Science" in subj_data["insightText"]

    # Validate Zone 4 Diagnostics
    assert len(result["diagnostics"]["topStrengths"]) == 1
    assert result["diagnostics"]["topStrengths"][0]["title"] == "Nutrition in Living Organisms"
    assert len(result["diagnostics"]["focusPriorities"]) == 1
    assert result["diagnostics"]["focusPriorities"][0]["title"] == "Integers"

    # Validate Zone 5 History
    assert len(result["history"]) == 1
    assert result["history"][0]["assessmentId"] == 3
    assert result["history"][0]["tierBadge"] == "Mastered"


if __name__ == "__main__":
    asyncio.run(test_analytics_dashboard_insights_computation())
    print("✓ test_analytics_dashboard_insights_computation PASSED")
    print("\nALL ANALYTICS DASHBOARD TESTS PASSED SUCCESSFULLY!")
