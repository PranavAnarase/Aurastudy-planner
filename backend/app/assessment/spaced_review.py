"""
Spaced Review & Retention Subsystem.
Monitors next_review_date <= CURRENT_DATE, generates 5-question Spaced Recall Quizzes,
and processes pass (double interval: 7 -> 14 -> 30) vs fail (reset interval=1, downgrade to Developing, trigger rebalance).
"""

from datetime import date, timedelta
from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func

from app.models.chapter_mastery import ChapterMastery, ConfidenceEnum
from app.models.chapter import Chapter
from app.models.subject import Subject
from app.planner.rebalancer import (
    compute_ema_mastery_40_60
)


async def get_due_spaced_reviews(
    session: AsyncSession,
    student_id: int,
    today: Optional[date] = None
) -> List[Dict[str, Any]]:
    """
    Checks chapter_mastery for records where next_review_date <= CURRENT_DATE.
    Returns list of chapters ready for Spaced Recall Quizzes.
    """
    if today is None:
        today = date.today()

    stmt = (
        select(ChapterMastery, Chapter, Subject)
        .join(Chapter, ChapterMastery.chapter_id == Chapter.chapter_id)
        .join(Subject, Chapter.subject_id == Subject.subject_id)
        .where(
            and_(
                ChapterMastery.student_id == student_id,
                ChapterMastery.next_review_date <= today
            )
        )
        .order_by(ChapterMastery.next_review_date.asc())
    )
    res = await session.execute(stmt)
    records = res.all()

    due_list = []
    for mastery, ch, subj in records:
        days_overdue = (today - (mastery.next_review_date or today)).days
        due_list.append({
            "chapter_id": ch.chapter_id,
            "chapter_name": ch.chapter_name,
            "chapter_number": ch.chapter_number,
            "subject_id": subj.subject_id,
            "subject_name": subj.subject_name,
            "mastery_score": float(mastery.mastery_score),
            "confidence": mastery.confidence.value if hasattr(mastery.confidence, 'value') else str(mastery.confidence),
            "interval_days": mastery.interval_days,
            "next_review_date": mastery.next_review_date,
            "days_overdue": max(0, days_overdue)
        })

    return due_list


def calculate_next_spaced_interval(current_interval: int, passed: bool) -> int:
    """
    Spaced interval progression:
    - If passed (>=70%): double interval (7 -> 14 -> 30 max 90)
    - If failed (<70%): reset to 1 day
    """
    if not passed:
        return 1

    if current_interval <= 1:
        return 3
    elif current_interval <= 3:
        return 7
    elif current_interval <= 7:
        return 14
    elif current_interval <= 14:
        return 30
    else:
        return min(90, current_interval * 2)


async def process_spaced_review_result(
    session: AsyncSession,
    student_id: int,
    chapter_id: int,
    raw_score: float,
    today: Optional[date] = None
) -> Dict[str, Any]:
    """
    Applies retention update rules:
    - Pass (>= 70%): double interval, retain/upgrade confidence.
    - Fail (< 70%): reset interval_days=1, downgrade to Developing (MEDIUM/LOW), trigger rebalance.
    """
    if today is None:
        today = date.today()

    passed = raw_score >= 70.0

    # Fetch mastery record
    stmt = select(ChapterMastery).where(
        and_(
            ChapterMastery.student_id == student_id,
            ChapterMastery.chapter_id == chapter_id
        )
    )
    res = await session.execute(stmt)
    mastery = res.scalar_one_or_none()

    if not mastery:
        raise ValueError(f"Mastery record not found for student {student_id}, chapter {chapter_id}")

    old_mastery = float(mastery.mastery_score)
    old_interval = mastery.interval_days or 1

    # 40/60 EMA blend for mastery score
    new_mastery = compute_ema_mastery_40_60(raw_score, old_mastery)
    new_interval = calculate_next_spaced_interval(old_interval, passed)
    next_review_date = today + timedelta(days=new_interval)

    # Determine confidence
    if new_mastery >= 75.0 and passed:
        new_confidence = ConfidenceEnum.HIGH
    elif new_mastery >= 50.0 or passed:
        new_confidence = ConfidenceEnum.MEDIUM
    else:
        new_confidence = ConfidenceEnum.LOW

    # Update mastery record
    mastery.mastery_score = new_mastery
    mastery.confidence = new_confidence
    mastery.interval_days = new_interval
    mastery.next_review_date = next_review_date
    mastery.repetitions = (mastery.repetitions or 0) + 1
    mastery.last_assessed = func.current_timestamp()

    await session.commit()

    return {
        "chapter_id": chapter_id,
        "raw_score": raw_score,
        "passed": passed,
        "old_mastery": old_mastery,
        "new_mastery": new_mastery,
        "old_interval_days": old_interval,
        "new_interval_days": new_interval,
        "confidence": new_confidence.value,
        "next_review_date": next_review_date,
        "trigger_rebalance": not passed
    }
