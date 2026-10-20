"""
Performance Tiers and Action Logic for Standard 7 Chapter Assessments.
Handles tier classification, confidence mapping, interval days setting, and curriculum actions.
"""

from datetime import date, timedelta
from typing import Dict, Any
from enum import Enum


class MasteryTierEnum(str, Enum):
    CRITICAL = "Critical"
    DEVELOPING = "Developing"
    MASTERED = "Mastered"


class ConfidenceEnum(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


def classify_performance_tier(score: float, today: date | None = None) -> Dict[str, Any]:
    """
    Classifies a chapter score into Critical (<50%), Developing (50%-74%), or Mastered (>=75%).
    Returns pedagogical actions, timetable block specs, spaced review intervals, and curriculum flags.
    """
    if today is None:
        today = date.today()

    score_val = float(score)

    if score_val < 50.0:
        tier = MasteryTierEnum.CRITICAL
        confidence = ConfidenceEnum.LOW
        interval_days = 1
        days_per_week = "5-6"
        block_duration_minutes = 45  # 40-45 min deep-focus blocks
        unlock_next_chapter = False
        action_summary = "Subject receives high priority (5-6 days/wk in 40-45 min deep-focus blocks). Foundational concept review triggered; re-test queued in 1-2 days."
        recommendation = "Review foundational concepts and formulas before attempting advanced practice."
    elif score_val < 75.0:
        tier = MasteryTierEnum.DEVELOPING
        confidence = ConfidenceEnum.MEDIUM
        interval_days = 3
        days_per_week = "3-4"
        block_duration_minutes = 40  # 35-40 min standard blocks
        unlock_next_chapter = True
        action_summary = "Subject receives standard priority (3-4 days/wk in 35-40 min blocks). Next chapter unlocked; spaced review queued in 3-5 days."
        recommendation = "Solve reinforcement practice problems to strengthen conceptual grasp."
    else:
        tier = MasteryTierEnum.MASTERED
        confidence = ConfidenceEnum.HIGH
        interval_days = 7
        days_per_week = "2-3"
        block_duration_minutes = 25  # 20-25 min quick practice blocks
        unlock_next_chapter = True
        action_summary = "Subject trims to maintenance load (2-3 days/wk in 20-25 min quick practice blocks). Surplus hours shift to weaker subjects; retention quiz queued in 7-14 days."
        recommendation = "Maintain mastery with periodic quick practice and retention recall quizzes."

    next_review_date = today + timedelta(days=interval_days)

    return {
        "score": score_val,
        "tier": tier.value,
        "confidence": confidence.value,
        "interval_days": interval_days,
        "next_review_date": next_review_date,
        "days_per_week": days_per_week,
        "block_duration_minutes": block_duration_minutes,
        "unlock_next_chapter": unlock_next_chapter,
        "action_summary": action_summary,
        "recommendation": recommendation
    }
