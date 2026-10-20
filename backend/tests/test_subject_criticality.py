"""
Unit tests for SubjectCriticalityEngine and Progressive Chapter Gating.
"""

import pytest
from app.progress.subject_criticality import SubjectCriticalityEngine, STANDARD_7_SUBJECTS
from app.planner.rebalancer import compute_ema_mastery_40_60


def test_subject_mastery_aggregation():
    chapters = [
        {"chapter_id": 1, "subject_name": "Mathematics", "chapter_number": 1},
        {"chapter_id": 2, "subject_name": "Mathematics", "chapter_number": 2},
        {"chapter_id": 3, "subject_name": "General Science", "chapter_number": 1},
        {"chapter_id": 4, "subject_name": "General Science", "chapter_number": 2},
        {"chapter_id": 5, "subject_name": "English", "chapter_number": 1}
    ]
    # Chapter 1 = 80%, Chapter 2 = 60% -> Math average = 70%
    # Chapter 3 = 40%, Chapter 4 = unassessed (default 0) -> Science average = 20%
    # Chapter 5 = 90% -> English = 90%
    # Other standard 7 subjects = 0% default
    masteries_map = {
        1: 80.0,
        2: 60.0,
        3: 40.0,
        5: 90.0
    }

    masteries = SubjectCriticalityEngine.compute_subject_masteries(chapters, masteries_map, default_unassessed=0.0)

    assert masteries["Mathematics"] == 70.0
    assert masteries["General Science"] == 20.0
    assert masteries["English"] == 90.0
    assert masteries["History & Civics"] == 0.0


def test_progressive_chapter_gating():
    chapters = [
        {"chapter_id": 101, "subject_name": "Mathematics", "chapter_number": 1, "chapter_name": "Integers"},
        {"chapter_id": 102, "subject_name": "Mathematics", "chapter_number": 2, "chapter_name": "Fractions"},
        {"chapter_id": 103, "subject_name": "Mathematics", "chapter_number": 3, "chapter_name": "Decimals"},
        {"chapter_id": 201, "subject_name": "English", "chapter_number": 1, "chapter_name": "Grammar Basics"},
        {"chapter_id": 202, "subject_name": "English", "chapter_number": 2, "chapter_name": "Tenses"}
    ]

    # Scenario A: Math Ch 1 is Critical (40% < 50%) -> Ch 2 is LOCKED, Ch 3 is LOCKED
    # English Ch 1 is Mastered (85% >= 50%) -> Ch 2 is UNLOCKED
    masteries_map = {
        101: 40.0,
        201: 85.0
    }
    gating = SubjectCriticalityEngine.evaluate_progressive_chapter_gating(chapters, masteries_map)

    # Math
    assert gating[101]["is_unlocked"] is True
    assert gating[101]["is_locked"] is False

    assert gating[102]["is_unlocked"] is False
    assert gating[102]["is_locked"] is True
    assert "Integers" in gating[102]["unlock_requirement"]

    assert gating[103]["is_unlocked"] is False
    assert gating[103]["is_locked"] is True

    # English
    assert gating[201]["is_unlocked"] is True
    assert gating[202]["is_unlocked"] is True
    assert gating[202]["is_locked"] is False


def test_progressive_unlock_when_prerequisite_cleared():
    chapters = [
        {"chapter_id": 101, "subject_name": "Mathematics", "chapter_number": 1, "chapter_name": "Integers"},
        {"chapter_id": 102, "subject_name": "Mathematics", "chapter_number": 2, "chapter_name": "Fractions"},
        {"chapter_id": 103, "subject_name": "Mathematics", "chapter_number": 3, "chapter_name": "Decimals"}
    ]

    # Math Ch 1 = 60% (Developing), Math Ch 2 = 30% (Critical)
    # -> Ch 1 is unlocked, Ch 2 is unlocked, Ch 3 is locked
    masteries_map = {
        101: 60.0,
        102: 30.0
    }
    gating = SubjectCriticalityEngine.evaluate_progressive_chapter_gating(chapters, masteries_map)

    assert gating[101]["is_unlocked"] is True
    assert gating[102]["is_unlocked"] is True
    assert gating[103]["is_unlocked"] is False
    assert "Fractions" in gating[103]["unlock_requirement"]


def test_subject_criticality_normalization_and_floors():
    subject_masteries = {
        "Mathematics": 30.0,      # Deficiency = 70.0 -> Raw Weight = 70.0
        "General Science": 90.0,  # Deficiency = 10.0 -> Floor = 15.0
        "History & Civics": 50.0, # Deficiency = 50.0 -> Raw Weight = 50.0
        "Geography": 80.0,        # Deficiency = 20.0 -> Raw Weight = 20.0
        "English": 95.0,          # Deficiency = 5.0  -> Floor = 15.0
        "Hindi": 60.0,            # Deficiency = 40.0 -> Raw Weight = 40.0
        "Marathi": 70.0           # Deficiency = 30.0 -> Raw Weight = 30.0
    }
    # Total raw = 70 + 15 + 50 + 20 + 15 + 40 + 30 = 240.0

    criticalities = SubjectCriticalityEngine.calculate_subject_criticalities(subject_masteries)

    # 1. Total normalized weight must equal 1.0
    norm_sum = sum(c["normalized_weight"] for c in criticalities.values())
    assert pytest.approx(norm_sum, rel=1e-4) == 1.0

    # 2. Math has highest criticality weight (70 / 240 = 0.2917)
    assert criticalities["Mathematics"]["normalized_weight"] == pytest.approx(70.0 / 240.0, rel=1e-4)
    assert criticalities["Mathematics"]["tier"] == "Critical"
    assert criticalities["Mathematics"]["days_per_week"] == "5-6"
    assert criticalities["Mathematics"]["block_duration_minutes"] == 45

    # 3. Science and English both hit the 15% floor (15 / 240 = 0.0625)
    assert criticalities["General Science"]["normalized_weight"] == pytest.approx(15.0 / 240.0, rel=1e-4)
    assert criticalities["English"]["normalized_weight"] == pytest.approx(15.0 / 240.0, rel=1e-4)
    assert criticalities["English"]["tier"] == "Mastered"
    assert criticalities["English"]["days_per_week"] == "2-3"
    assert criticalities["English"]["block_duration_minutes"] == 25


def test_composite_chapter_priority_calculation():
    # Subject A: Critical subject (W_bar = 0.30), Chapter weakness = 80.0 (Mastery = 20.0), overdue = 0
    # Priority = 0.30 * 1.0 * 80.0 = 24.0
    p1 = SubjectCriticalityEngine.compute_composite_chapter_priority(
        subject_criticality_weight=0.30,
        chapter_mastery_score=20.0,
        days_overdue=0
    )
    assert p1 == 24.0

    # Subject B: Mastered subject (W_bar = 0.0625), Chapter weakness = 80.0 (Mastery = 20.0), overdue = 0
    # Priority = 0.0625 * 1.0 * 80.0 = 5.0
    p2 = SubjectCriticalityEngine.compute_composite_chapter_priority(
        subject_criticality_weight=0.0625,
        chapter_mastery_score=20.0,
        days_overdue=0
    )
    assert p2 == 5.0

    # Subject A chapter receives much higher priority due to subject criticality!
    assert p1 > p2


def test_adaptive_40_60_subject_mastery_update():
    # Historical Subject Mastery = 40.0%, Recent Test Raw Score = 90.0%
    # Updated = 0.40 * 40 + 0.60 * 90 = 16 + 54 = 70.0%
    updated = compute_ema_mastery_40_60(raw_score=90.0, historical_mastery=40.0)
    assert updated == 70.0
