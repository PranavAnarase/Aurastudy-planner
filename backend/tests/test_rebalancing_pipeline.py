"""
Unit tests for the 5-step Deficiency-Driven Dynamic Rebalancing Algorithm.
Tests mathematical specifications, 40/60 EMA, 15% floor, and dynamic weekly budget (daily_study_hours * 7).
"""

import pytest
from app.planner.rebalancer import (
    calculate_raw_score,
    compute_ema_mastery_40_60,
    compute_deficiency_gap,
    compute_normalized_weights,
    allocate_weekly_clock_hours,
    execute_rebalancing_pipeline,
    STANDARD_7_SUBJECTS,
    MAINTENANCE_FLOOR_ALPHA
)


def test_step1_raw_attempt_scoring():
    # 8 out of 10
    assert calculate_raw_score(8, 10) == 80.0
    # 0 out of 10
    assert calculate_raw_score(0, 10) == 0.0
    # 13 out of 15
    assert calculate_raw_score(13, 15) == round((13 / 15) * 100, 2)
    # Total marks 0 edge case
    assert calculate_raw_score(5, 0) == 0.0


def test_step2_adaptive_ema_mastery_update_40_60():
    # First attempt: historical is None -> raw score directly
    assert compute_ema_mastery_40_60(raw_score=80.0, historical_mastery=None) == 80.0
    
    # Subsequent attempt: 40% historical + 60% recent
    # Historical = 50.0, Recent Raw = 90.0 -> (0.40 * 50) + (0.60 * 90) = 20 + 54 = 74.0
    assert compute_ema_mastery_40_60(raw_score=90.0, historical_mastery=50.0) == 74.0
    
    # Historical = 80.0, Recent Raw = 40.0 -> (0.40 * 80) + (0.60 * 40) = 32 + 24 = 56.0
    assert compute_ema_mastery_40_60(raw_score=40.0, historical_mastery=80.0) == 56.0


def test_step3_deficiency_gap_inversion():
    # Mastery = 70.0 -> Gap = 30.0
    assert compute_deficiency_gap(70.0) == 30.0
    # Mastery = 100.0 -> Gap = 0.0
    assert compute_deficiency_gap(100.0) == 0.0
    # Mastery = 0.0 -> Gap = 100.0
    assert compute_deficiency_gap(0.0) == 100.0


def test_step4_maintenance_floor_and_normalization():
    # If a subject has 95% mastery, its deficiency gap is 5%, but floor is 15%
    masteries = {
        "Mathematics": 95.0,     # Gap = 5%  -> Floor = 15%
        "General Science": 30.0, # Gap = 70% -> 70%
        "History & Civics": 50.0,# Gap = 50% -> 50%
        "Geography": 60.0,       # Gap = 40% -> 40%
        "English": 80.0,         # Gap = 20% -> 20%
        "Hindi": 85.0,           # Gap = 15% -> 15%
        "Marathi": 90.0          # Gap = 10% -> Floor = 15%
    }
    
    normalized = compute_normalized_weights(masteries)
    
    # Sum of normalized weights must equal 1.0 (within float precision)
    assert pytest.approx(sum(normalized.values()), rel=1e-5) == 1.0
    
    # Mathematics and Marathi should both have raw weight = 15.0, so same normalized weight
    assert pytest.approx(normalized["Mathematics"], rel=1e-5) == normalized["Marathi"]
    
    # Science has highest raw weight (70), so should have largest normalized weight
    assert normalized["General Science"] == max(normalized.values())


@pytest.mark.parametrize("daily_hours", [2.0, 2.5, 3.0, 3.5, 4.0])
def test_step5_weekly_clock_hour_allocation_budget(daily_hours):
    expected_budget = daily_hours * 7.0
    
    masteries = {
        "Mathematics": 40.0,
        "General Science": 60.0,
        "History & Civics": 30.0,
        "Geography": 75.0,
        "English": 80.0,
        "Hindi": 50.0,
        "Marathi": 70.0
    }
    
    normalized = compute_normalized_weights(masteries)
    allocated = allocate_weekly_clock_hours(normalized, daily_study_hours=daily_hours, step=0.5)
    
    # 1. Sum of allocated hours must strictly equal dynamic budget T
    assert pytest.approx(sum(allocated.values()), abs=1e-3) == expected_budget
    
    # 2. Every allocated value must be a multiple of 0.5
    for subj, hrs in allocated.items():
        assert (hrs * 2) == int(hrs * 2), f"{subj} allocation {hrs} is not a multiple of 0.5"
        assert hrs > 0, f"{subj} allocation {hrs} must be strictly positive"


def test_full_rebalancing_pipeline_execution():
    subject_masteries = {
        "Mathematics": 45.0,
        "General Science": 80.0
    }
    daily_hours = 3.0  # Budget T = 21.0 hrs
    
    result = execute_rebalancing_pipeline(subject_masteries, daily_hours)
    
    assert result["weekly_budget_hours"] == 21.0
    assert result["daily_study_hours"] == 3.0
    assert len(result["subject_masteries"]) == 7
    assert sum(result["allocated_hours"].values()) == 21.0
    assert sum(result["allocated_minutes"].values()) == 21 * 60
