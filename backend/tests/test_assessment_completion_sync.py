import pytest
from datetime import date, timedelta
from unittest.mock import AsyncMock, MagicMock
from app.progress.tracker import ProgressTracker
from app.models.chapter_mastery import ChapterMastery, StageEnum


@pytest.mark.asyncio
async def test_mastered_chapter_omitted_from_active_study_queue_when_not_due():
    mock_repo = MagicMock()
    today = date(2026, 10, 23)

    student = MagicMock()
    student.standard_id = 7
    mock_repo.get_student_profile = AsyncMock(return_value=student)

    # Chapters in standard: Chapter 1 (Mastered) and Chapter 2 (Unlocked)
    mock_repo.get_standard_chapters_with_subjects = AsyncMock(return_value=[
        {
            "chapter_id": 1,
            "subject_id": 1,
            "chapter_number": 1,
            "chapter_name": "Integers",
            "subject_name": "Mathematics",
            "display_order": 1
        },
        {
            "chapter_id": 2,
            "subject_id": 1,
            "chapter_number": 2,
            "chapter_name": "Fractions",
            "subject_name": "Mathematics",
            "display_order": 2
        }
    ])

    # No diagnostic restriction filter
    mock_repo.session.execute = AsyncMock()
    res_mock = MagicMock()
    res_mock.fetchall.return_value = [("Mathematics",)]
    mock_repo.session.execute.return_value = res_mock

    # Chapter 1 is mastered (score=90.0, next review in 7 days)
    chap1_mastery = ChapterMastery(
        student_id=1,
        chapter_id=1,
        mastery_score=90.0,
        next_review_date=today + timedelta(days=7),
        current_stage=StageEnum.COMPLETED
    )
    mock_repo.get_all_chapter_masteries = AsyncMock(return_value=[chap1_mastery])

    tracker = ProgressTracker(mock_repo)
    pq = await tracker.get_due_chapters_queue(student_id=1, today=today)

    items = pq.get_all_ordered()
    chapter_ids = [item[0] for item in items]

    # Chapter 1 must be omitted from the active study queue since it was mastered with 90% and next review is in the future.
    # Chapter 2 must be present.
    assert 1 not in chapter_ids
    assert 2 in chapter_ids


@pytest.mark.asyncio
async def test_mastered_chapter_included_when_spaced_review_is_due():
    mock_repo = MagicMock()
    today = date(2026, 10, 23)

    student = MagicMock()
    student.standard_id = 7
    mock_repo.get_student_profile = AsyncMock(return_value=student)

    mock_repo.get_standard_chapters_with_subjects = AsyncMock(return_value=[
        {
            "chapter_id": 1,
            "subject_id": 1,
            "chapter_number": 1,
            "chapter_name": "Integers",
            "subject_name": "Mathematics",
            "display_order": 1
        }
    ])

    mock_repo.session.execute = AsyncMock()
    res_mock = MagicMock()
    res_mock.fetchall.return_value = [("Mathematics",)]
    mock_repo.session.execute.return_value = res_mock

    # Chapter 1 is mastered, but review is due today!
    chap1_mastery = ChapterMastery(
        student_id=1,
        chapter_id=1,
        mastery_score=90.0,
        next_review_date=today,
        current_stage=StageEnum.COMPLETED
    )
    mock_repo.get_all_chapter_masteries = AsyncMock(return_value=[chap1_mastery])

    tracker = ProgressTracker(mock_repo)
    pq = await tracker.get_due_chapters_queue(student_id=1, today=today)

    items = pq.get_all_ordered()
    chapter_ids = [item[0] for item in items]

    # Since today >= next_review_date, Chapter 1 is included for retention review
    assert 1 in chapter_ids
