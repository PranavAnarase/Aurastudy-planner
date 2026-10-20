import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from app.planner.gap_scheduler import (
    time_str_to_minutes,
    minutes_to_time_str,
    clamp_interval,
    merge_intervals,
    extract_dynamic_gaps,
    generate_adaptive_test_slots,
    calculate_topic_urgency,
    filter_eligible_topics,
    rank_topics_by_urgency,
    WAKE_MINUTE,
    SLEEP_MINUTE,
)


def test_time_conversions():
    """Verify bidirectional 12h/24h conversion and scalar integer representation."""
    assert time_str_to_minutes("06:00 AM") == 360
    assert time_str_to_minutes("06:00") == 360
    assert time_str_to_minutes("10:00 PM") == 1320
    assert time_str_to_minutes("22:00") == 1320
    assert time_str_to_minutes("12:00 PM") == 720
    assert time_str_to_minutes("12:00 AM") == 0

    assert minutes_to_time_str(360) == "06:00 AM"
    assert minutes_to_time_str(1320) == "10:00 PM"
    assert minutes_to_time_str(720) == "12:00 PM"


def test_boundary_clamping_and_sleep_lockout():
    """Verify no interval leaks outside operable waking domain [360, 1320]."""
    # Interval completely inside sleep (02:00 - 05:00) -> clamped out
    assert clamp_interval(120, 300) is None
    
    # Interval crossing wake boundary (05:00 - 08:00) -> clamped to [360, 480]
    clamped = clamp_interval(300, 480)
    assert clamped == {"start_min": 360, "end_min": 480}
    
    # Interval crossing sleep boundary (21:30 - 23:30) -> clamped to [1290, 1320]
    clamped_late = clamp_interval(1290, 1410)
    assert clamped_late == {"start_min": 1290, "end_min": 1320}


def test_merge_contiguous_and_overlapping():
    """Verify contiguous and overlapping intervals merge without 0-minute gaps."""
    intervals = [
        {"start_min": 540, "end_min": 720, "label": "College Part 1"},
        {"start_min": 720, "end_min": 900, "label": "College Part 2"}, # contiguous
        {"start_min": 850, "end_min": 960, "label": "Tuition"},       # overlapping
    ]
    merged = merge_intervals(intervals)
    assert len(merged) == 1
    assert merged[0]["start_min"] == 540
    assert merged[0]["end_min"] == 960
    assert "College Part 1" in merged[0]["label"]


def test_regular_weekday_schedule():
    """
    Scenario: Regular Weekday
    - Commitments: College 09:00 - 17:00 (540 - 1020m)
    - Study: Deep Study 18:00 - 20:30 (1080 - 1230m)
    Expected Dynamic Slots:
    1. Gap 1: 06:00 - 09:00 (180m post-sleep) -> Post-Sleep Recall Test (06:15 - 07:00, 45m duration)
    2. Gap 2: 17:00 - 18:00 (60m) -> Centered Spaced Revision Quiz (17:15 - 17:45, 30m duration)
    3. Gap 3: 20:30 - 22:00 (90m) -> Centered Spaced Revision Quiz (21:00 - 21:30, 30m duration)
    """
    commitments = [{"start_min": 540, "end_min": 1020, "label": "College"}]
    study_slots = [{"start_min": 1080, "end_min": 1230, "label": "Deep Study"}]
    
    slots = generate_adaptive_test_slots(commitments, study_slots)
    
    assert len(slots) == 3
    
    # Slot 1: Post-Sleep Retention Test
    assert slots[0]["activity_type"] == "FIRST_GAP_RETENTION_TEST"
    assert slots[0]["start_minutes"] == 375  # 06:15 AM (15m wake buffer)
    assert slots[0]["duration_minutes"] == 45
    assert slots[0]["end_minutes"] == 420    # 07:00 AM
    assert slots[0]["content_ratio"] == {"prior_day_percent": 70, "decaying_weak_percent": 30}
    
    # Slot 2: Between College and Study (60m gap, 30m centered quiz)
    assert slots[1]["activity_type"] == "SPACED_REVISION_QUIZ"
    assert slots[1]["start_minutes"] == 1035 # 17:00 + (60-30)/2 = 17:15 (1035m)
    assert slots[1]["duration_minutes"] == 30
    assert slots[1]["end_minutes"] == 1065   # 17:45 (1065m)
    
    # Slot 3: After Study to Sleep (90m gap, 30m centered quiz)
    assert slots[2]["activity_type"] == "SPACED_REVISION_QUIZ"
    assert slots[2]["start_minutes"] == 1260 # 1230 + (90-30)/2 = 1260 (21:00 / 09:00 PM)
    assert slots[2]["duration_minutes"] == 30
    assert slots[2]["end_minutes"] == 1290   # 21:30 (1290m)


def test_micro_drill_short_gap():
    """
    Scenario: Gap [20, 45) minutes -> MICRO_DRILL
    e.g. Free gap of 35 minutes (14:00 to 14:35)
    """
    commitments = [
        {"start_min": 360, "end_min": 840, "label": "School"},       # 06:00 - 14:00
        {"start_min": 875, "end_min": 1320, "label": "Extracurricular"} # 14:35 - 22:00
    ]
    slots = generate_adaptive_test_slots(commitments, [])
    assert len(slots) == 1
    assert slots[0]["activity_type"] == "MICRO_DRILL"
    assert slots[0]["start_minutes"] == 840
    assert slots[0]["end_minutes"] == 875
    assert slots[0]["duration_minutes"] == 35


def test_tight_schedule_under_threshold():
    """Verify that gaps < 20 mins are completely discarded as human transit buffers."""
    commitments = [
        {"start_min": 360, "end_min": 600, "label": "Session 1"},
        {"start_min": 615, "end_min": 900, "label": "Session 2"}, # 15 min gap (< 20)
        {"start_min": 910, "end_min": 1320, "label": "Session 3"}, # 10 min gap (< 20)
    ]
    slots = generate_adaptive_test_slots(commitments, [])
    assert len(slots) == 0


def test_adaptive_topic_retention_urgency():
    """Verify retention urgency formula and eligibility gatekeeping."""
    topics = [
        {
            "chapter_id": 1,
            "chapter_name": "Kinematics",
            "mastery_score": 40.0,
            "days_since_review": 3,
            "was_studied_yesterday": True,
            "is_unlocked": True,
            "is_completed_or_in_progress": True
        },
        {
            "chapter_id": 2,
            "chapter_name": "Organic Reactions",
            "mastery_score": 85.0,
            "days_since_review": 1,
            "was_studied_yesterday": False,
            "is_unlocked": True,
            "is_completed_or_in_progress": True
        },
        {
            "chapter_id": 3,
            "chapter_name": "Unstudied Nuclear Physics",
            "mastery_score": 0.0,
            "was_studied_yesterday": False,
            "is_unlocked": True,
            "is_completed_or_in_progress": False
        },
        {
            "chapter_id": 4,
            "chapter_name": "Locked Advanced Calculus",
            "mastery_score": 0.0,
            "is_unlocked": False,
            "is_completed_or_in_progress": False
        }
    ]
    
    ranked = rank_topics_by_urgency(topics)
    
    # Must filter out unstudied chapter 3 and locked chapter 4
    chapter_ids = [t["chapter_id"] for t in ranked]
    assert 3 not in chapter_ids
    assert 4 not in chapter_ids
    
    # Kinematics (studied yesterday + low mastery 40%) must rank higher than Organic Reactions (high mastery 85%)
    assert ranked[0]["chapter_id"] == 1
    assert ranked[0]["urgency_score"] > ranked[1]["urgency_score"]
