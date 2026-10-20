"""
Unit tests for performance tiers classification and spaced retention interval progression.
"""

from datetime import date, timedelta
from app.assessment.tier_actions import classify_performance_tier, MasteryTierEnum, ConfidenceEnum
from app.assessment.spaced_review import calculate_next_spaced_interval


def test_tier_critical_classification():
    today = date(2026, 8, 22)
    res = classify_performance_tier(45.0, today=today)
    
    assert res["tier"] == MasteryTierEnum.CRITICAL.value
    assert res["confidence"] == ConfidenceEnum.LOW.value
    assert res["interval_days"] == 1
    assert res["next_review_date"] == today + timedelta(days=1)
    assert res["unlock_next_chapter"] is False
    assert res["block_duration_minutes"] == 45


def test_tier_developing_classification():
    today = date(2026, 8, 22)
    res = classify_performance_tier(65.0, today=today)
    
    assert res["tier"] == MasteryTierEnum.DEVELOPING.value
    assert res["confidence"] == ConfidenceEnum.MEDIUM.value
    assert res["interval_days"] == 3
    assert res["next_review_date"] == today + timedelta(days=3)
    assert res["unlock_next_chapter"] is True
    assert res["block_duration_minutes"] == 40


def test_tier_mastered_classification():
    today = date(2026, 8, 22)
    res = classify_performance_tier(88.0, today=today)
    
    assert res["tier"] == MasteryTierEnum.MASTERED.value
    assert res["confidence"] == ConfidenceEnum.HIGH.value
    assert res["interval_days"] == 7
    assert res["next_review_date"] == today + timedelta(days=7)
    assert res["unlock_next_chapter"] is True
    assert res["block_duration_minutes"] == 25


def test_spaced_interval_progression_on_pass():
    # Progression: 1 -> 3 -> 7 -> 14 -> 30
    assert calculate_next_spaced_interval(1, passed=True) == 3
    assert calculate_next_spaced_interval(3, passed=True) == 7
    assert calculate_next_spaced_interval(7, passed=True) == 14
    assert calculate_next_spaced_interval(14, passed=True) == 30
    assert calculate_next_spaced_interval(30, passed=True) == 60


def test_spaced_interval_reset_on_fail():
    # Failure at any interval resets back to 1 day
    assert calculate_next_spaced_interval(7, passed=False) == 1
    assert calculate_next_spaced_interval(14, passed=False) == 1
    assert calculate_next_spaced_interval(30, passed=False) == 1
