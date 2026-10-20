"""
AuraStudy Pure Dynamic Time-Gap Scheduler & Active Recall Engine (Backend Python Service)

Invariants & Constraints:
- Universal Sleep Window: 10:00 PM (1320m) to 06:00 AM (360m) is strictly locked out.
- Operable Daily Domain: Ω = [360, 1320] minutes from midnight (960 total minutes).
- Zero hardcoded time brackets: all dynamic decisions relative to gap duration Δk,
  proximity to sleep boundary, and contextual order.
- Dynamic gaps NEVER introduce new syllabus material; strictly reserved for active recall
  and error-bank micro-drills on studied material.
"""

from typing import List, Dict, Any, Optional
from datetime import datetime
import re
import math

WAKE_MINUTE = 360    # 06:00 AM
SLEEP_MINUTE = 1320  # 10:00 PM
MIN_GAP_THRESHOLD = 20


def time_str_to_minutes(time_str: str) -> int:
    """Convert 'HH:MM' 24h or 'HH:MM AM/PM' 12h to integer minutes from midnight [0, 1439]."""
    if not time_str or not isinstance(time_str, str):
        return 0
    t = time_str.strip()
    
    # 12h format e.g. "08:30 AM", "6:00 PM"
    match12 = re.match(r'^(\d{1,2}):(\d{2})\s*(AM|PM)$', t, re.IGNORECASE)
    if match12:
        hours = int(match12.group(1))
        minutes = int(match12.group(2))
        is_pm = match12.group(3).upper() == "PM"
        if hours == 12:
            hours = 12 if is_pm else 0
        elif is_pm:
            hours += 12
        return min(1439, max(0, hours * 60 + minutes))
    
    # 24h format e.g. "09:00", "18:30"
    parts = t.split(":")
    if len(parts) >= 2:
        try:
            h = int(parts[0])
            m = int(parts[1])
            return min(1439, max(0, h * 60 + m))
        except ValueError:
            pass
    return 0


def minutes_to_time_str(total_minutes: int) -> str:
    """Convert integer minutes from midnight to 'hh:mm AM/PM' format."""
    normalized = ((int(total_minutes) % 1440) + 1440) % 1440
    h24 = normalized // 60
    mins = normalized % 60
    period = "PM" if h24 >= 12 else "AM"
    h12 = 12 if (h24 % 12 == 0) else (h24 % 12)
    return f"{h12:02d}:{mins:02d} {period}"


def clamp_interval(start_min: int, end_min: int, wake_min: int = WAKE_MINUTE, sleep_min: int = SLEEP_MINUTE) -> Optional[Dict[str, int]]:
    """Clamps an interval to the operable waking domain [wake_min, sleep_min]."""
    s = max(wake_min, min(sleep_min, start_min))
    e = max(wake_min, min(sleep_min, end_min))
    if e <= s:
        return None
    return {"start_min": s, "end_min": e}


def merge_intervals(intervals: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Merge overlapping and contiguous intervals in O(n log n)."""
    valid = [inv for inv in intervals if inv.get("end_min", 0) > inv.get("start_min", 0)]
    if not valid:
        return []
    
    valid.sort(key=lambda x: (x["start_min"], x["end_min"]))
    merged = [dict(valid[0])]
    
    for current in valid[1:]:
        prev = merged[-1]
        if current["start_min"] <= prev["end_min"]:
            prev["end_min"] = max(prev["end_min"], current["end_min"])
            if "label" in current and "label" in prev:
                if current["label"] not in prev["label"]:
                    prev["label"] = f"{prev['label']} / {current['label']}"
        else:
            merged.append(dict(current))
            
    return merged


def extract_dynamic_gaps(
    blocked_intervals: List[Dict[str, Any]],
    wake_min: int = WAKE_MINUTE,
    sleep_min: int = SLEEP_MINUTE
) -> List[Dict[str, Any]]:
    """Extract free gaps G = Ω \\ B_total within [wake_min, sleep_min]."""
    clamped = []
    for inv in blocked_intervals:
        c = clamp_interval(inv.get("start_min", 0), inv.get("end_min", 0), wake_min, sleep_min)
        if c:
            if "label" in inv:
                c["label"] = inv["label"]
            clamped.append(c)
            
    merged_blocked = merge_intervals(clamped)
    
    gaps = []
    cursor = wake_min
    
    for block in merged_blocked:
        if block["start_min"] > cursor:
            duration = block["start_min"] - cursor
            gaps.append({
                "start_min": cursor,
                "end_min": block["start_min"],
                "duration_min": duration,
                "is_first_post_sleep_gap": cursor == wake_min,
            })
        cursor = max(cursor, block["end_min"])
        
    if cursor < sleep_min:
        duration = sleep_min - cursor
        gaps.append({
            "start_min": cursor,
            "end_min": sleep_min,
            "duration_min": duration,
            "is_first_post_sleep_gap": cursor == wake_min,
        })
        
    return gaps


def generate_adaptive_test_slots(
    commitments: List[Dict[str, Any]] = None,
    planned_study_slots: List[Dict[str, Any]] = None,
    wake_min: int = WAKE_MINUTE,
    sleep_min: int = SLEEP_MINUTE
) -> List[Dict[str, Any]]:
    """
    Pure Relative Classification and Test Slot Generation:
    - Gap < 20 mins: Ignore
    - Post-Sleep Gap (start == wake_min): FIRST_GAP_RETENTION_TEST (15m buffer, duration min(45, gap-15))
    - Gap [20, 45) mins: MICRO_DRILL (duration = gap)
    - Gap >= 45 mins: SPACED_REVISION_QUIZ (30m centered)
    """
    all_blocked = (commitments or []) + (planned_study_slots or [])
    gaps = extract_dynamic_gaps(all_blocked, wake_min, sleep_min)
    
    dynamic_slots = []
    
    for gap in gaps:
        start_min = gap["start_min"]
        end_min = gap["end_min"]
        duration_min = gap["duration_min"]
        is_first = gap["is_first_post_sleep_gap"]
        
        # Rule 1: Ignore micro-gaps < 20 mins
        if duration_min < MIN_GAP_THRESHOLD:
            continue
            
        # Rule 2: Post-sleep retention test
        if is_first and start_min == wake_min:
            WAKE_BUFFER_MIN = 15
            test_start = start_min + WAKE_BUFFER_MIN
            test_duration = min(45, duration_min - WAKE_BUFFER_MIN)
            
            if test_duration >= MIN_GAP_THRESHOLD:
                test_end = test_start + test_duration
                q_count = 15 if test_duration >= 40 else (12 if test_duration >= 30 else 10)
                dynamic_slots.append({
                    "id": f"dynamic-post-sleep-{test_start}",
                    "activity_type": "FIRST_GAP_RETENTION_TEST",
                    "title": "Post-Sleep Recall Test",
                    "subtitle": "Consolidate memory from yesterday's study sessions",
                    "start_minutes": test_start,
                    "end_minutes": test_end,
                    "duration_minutes": test_duration,
                    "display_start_time": minutes_to_time_str(test_start),
                    "display_end_time": minutes_to_time_str(test_end),
                    "content_ratio": {
                        "prior_day_percent": 70,
                        "decaying_weak_percent": 30
                    },
                    "recommended_question_count": q_count
                })
                continue
                
        # Rule 3: Short gaps [20, 45) -> MICRO_DRILL
        if MIN_GAP_THRESHOLD <= duration_min < 45:
            q_count = 8 if duration_min >= 35 else (6 if duration_min >= 25 else 5)
            dynamic_slots.append({
                "id": f"dynamic-micro-drill-{start_min}",
                "activity_type": "MICRO_DRILL",
                "title": "Rapid Micro-Drill",
                "subtitle": "Quick error-correction & high-yield flashcards",
                "start_minutes": start_min,
                "end_minutes": end_min,
                "duration_minutes": duration_min,
                "display_start_time": minutes_to_time_str(start_min),
                "display_end_time": minutes_to_time_str(end_min),
                "recommended_question_count": q_count
            })
            continue
            
        # Rule 4: Large gaps >= 45 mins -> Centered 30-min SPACED_REVISION_QUIZ
        if duration_min >= 45:
            QUIZ_DURATION = 30
            offset = (duration_min - QUIZ_DURATION) // 2
            quiz_start = start_min + offset
            quiz_end = quiz_start + QUIZ_DURATION
            dynamic_slots.append({
                "id": f"dynamic-spaced-quiz-{quiz_start}",
                "activity_type": "SPACED_REVISION_QUIZ",
                "title": "Spaced Revision Quiz",
                "subtitle": "Targeting foundational concepts with mastery < 60%",
                "start_minutes": quiz_start,
                "end_minutes": quiz_end,
                "duration_minutes": QUIZ_DURATION,
                "display_start_time": minutes_to_time_str(quiz_start),
                "display_end_time": minutes_to_time_str(quiz_end),
                "recommended_question_count": 10
            })
            
    return dynamic_slots


def calculate_topic_urgency(
    topic: Dict[str, Any],
    w_recency: float = 1.5,
    default_stability: float = 2.0
) -> float:
    """
    Retention Urgency Equation:
    U_k = w_recency * (studied_yesterday ? 2.0 : 1.0) + (days_since / stability) * (1.0 - mastery)
    """
    raw_mastery = float(topic.get("mastery_score", 0.0))
    normalized_mastery = min(1.0, max(0.0, raw_mastery / 100.0))
    deficiency = 1.0 - normalized_mastery
    
    recency_mult = 2.0 if topic.get("was_studied_yesterday") else 1.0
    recency_comp = w_recency * recency_mult
    
    days_since = max(0, topic.get("days_since_review", 1))
    stability = max(0.5, float(topic.get("stability_factor", default_stability)))
    decay_comp = (days_since / stability) * deficiency
    
    error_count = topic.get("historical_error_count", 0)
    error_boost = min(2.0, error_count * 0.2) if error_count else 0.0
    
    return recency_comp + decay_comp + error_boost


def filter_eligible_topics(topics: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Strictly exclude unstudied or locked chapters."""
    eligible = []
    for t in topics:
        if not t.get("is_unlocked", True):
            continue
        if not t.get("is_completed_or_in_progress", False) and float(t.get("mastery_score", 0)) == 0 and not t.get("was_studied_yesterday"):
            continue
        eligible.append(t)
    return eligible


def rank_topics_by_urgency(
    topics: List[Dict[str, Any]],
    w_recency: float = 1.5
) -> List[Dict[str, Any]]:
    """Rank candidate topics by urgency descending."""
    eligible = filter_eligible_topics(topics)
    scored = []
    for t in eligible:
        item = dict(t)
        item["urgency_score"] = round(calculate_topic_urgency(t, w_recency), 3)
        scored.append(item)
    scored.sort(key=lambda x: x["urgency_score"], reverse=True)
    return scored
