"""
Dynamic Timetable Rebalancing Algorithm for Standard 7.
Implements the 5-Step Deficiency-Driven Rebalancing Pipeline:
1. Raw Attempt Scoring
2. Adaptive Subject Mastery Update (40/60 EMA Blend)
3. Deficiency Gap Inversion
4. Maintenance Floor (alpha = 15%) & Normalization
5. Weekly Clock Hour Allocation (T = daily_study_hours * 7, 0.5-hr step)
"""

from typing import Dict, Optional

STANDARD_7_SUBJECTS = [
    "Mathematics",
    "General Science",
    "History & Civics",
    "Geography",
    "English",
    "Hindi",
    "Marathi"
]

MAINTENANCE_FLOOR_ALPHA = 15.0  # 15% mandatory baseline floor


def calculate_raw_score(obtained_marks: float, total_marks: float) -> float:
    """
    Step 1: Raw Attempt Scoring
    Formula: Raw Score = (Obtained Marks / Total Marks) * 100
    """
    if total_marks <= 0:
        return 0.0
    score = (float(obtained_marks) / float(total_marks)) * 100.0
    return max(0.0, min(100.0, round(score, 2)))


def compute_ema_mastery_40_60(raw_score: float, historical_mastery: Optional[float] = None) -> float:
    """
    Step 2: Adaptive Subject Mastery Update (40/60 Rule)
    Formula:
        If first attempt: Updated Mastery = Raw Score
        Otherwise: Updated Mastery = (0.40 * Historical Mastery) + (0.60 * Raw Score)
    """
    if historical_mastery is None:
        return max(0.0, min(100.0, float(raw_score)))
    
    updated = (0.40 * float(historical_mastery)) + (0.60 * float(raw_score))
    return max(0.0, min(100.0, round(updated, 2)))


def compute_deficiency_gap(updated_mastery: float) -> float:
    """
    Step 3: Deficiency Gap Inversion
    Formula: Deficiency Gap = 100% - Updated Mastery
    """
    gap = 100.0 - float(updated_mastery)
    return max(0.0, min(100.0, round(gap, 2)))


def compute_normalized_weights(
    subject_masteries: Dict[str, float],
    floor_alpha: float = MAINTENANCE_FLOOR_ALPHA
) -> Dict[str, float]:
    """
    Step 4: Maintenance Floor & Normalization
    Formula:
        Raw Weight W_s = max(Deficiency Gap_s, floor_alpha)
        Normalized Weight W_bar_s = W_s / sum(W_i)
    """
    raw_weights: Dict[str, float] = {}
    
    for subject, mastery in subject_masteries.items():
        gap = compute_deficiency_gap(mastery)
        raw_weights[subject] = max(gap, floor_alpha)
    
    total_raw_weight = sum(raw_weights.values())
    if total_raw_weight <= 0:
        # Equal distribution fallback
        count = len(raw_weights) or 1
        return {s: 1.0 / count for s in raw_weights}
    
    normalized: Dict[str, float] = {
        s: w / total_raw_weight for s, w in raw_weights.items()
    }
    return normalized


def allocate_weekly_clock_hours(
    normalized_weights: Dict[str, float],
    daily_study_hours: float,
    step: float = 0.5
) -> Dict[str, float]:
    """
    Step 5: Weekly Clock Hour Allocation
    Formula:
        T = daily_study_hours * 7
        Allocated Hours_s = round(W_bar_s * T, step=0.5 hrs)
    Adjusts fractional rounding residuals so sum(Allocated Hours) exactly equals T.
    """
    total_budget = round(float(daily_study_hours) * 7.0, 2)
    if total_budget <= 0:
        return {s: 0.0 for s in normalized_weights}

    # Step 5a: Initial raw allocation and rounding to step
    raw_allocations: Dict[str, float] = {}
    rounded_allocations: Dict[str, float] = {}
    remainders: Dict[str, float] = {}

    for subject, weight in normalized_weights.items():
        raw_hours = weight * total_budget
        raw_allocations[subject] = raw_hours
        
        # Round to nearest step (e.g. 0.5)
        rounded = round(raw_hours / step) * step
        rounded_allocations[subject] = rounded
        remainders[subject] = raw_hours - rounded

    current_sum = sum(rounded_allocations.values())
    diff = round(total_budget - current_sum, 2)

    # Discretized residual balancing
    steps_needed = int(round(diff / step))
    
    if steps_needed > 0:
        # Allocate extra steps to subjects with highest positive remainder
        sorted_by_remainder = sorted(
            normalized_weights.keys(),
            key=lambda s: remainders[s],
            reverse=True
        )
        for i in range(steps_needed):
            subj = sorted_by_remainder[i % len(sorted_by_remainder)]
            rounded_allocations[subj] = round(rounded_allocations[subj] + step, 2)
    elif steps_needed < 0:
        # Deduct steps from subjects with most negative remainder (having room > 0.5)
        sorted_by_remainder = sorted(
            normalized_weights.keys(),
            key=lambda s: remainders[s]
        )
        for i in range(abs(steps_needed)):
            # Pick subject with highest allocated hours to prevent dropping below step
            candidates = [s for s in sorted_by_remainder if rounded_allocations[s] > step]
            if not candidates:
                candidates = sorted_by_remainder
            subj = candidates[i % len(candidates)]
            rounded_allocations[subj] = max(step, round(rounded_allocations[subj] - step, 2))

    return rounded_allocations


def execute_rebalancing_pipeline(
    subject_masteries: Dict[str, float],
    daily_study_hours: float
) -> Dict[str, any]:
    """
    Executes full 5-step rebalancing pipeline and returns detailed breakdown.
    """
    # Ensure all 7 Standard 7 subjects are represented
    full_masteries = {subj: 50.0 for subj in STANDARD_7_SUBJECTS}
    full_masteries.update(subject_masteries)

    deficiency_gaps = {
        s: compute_deficiency_gap(m) for s, m in full_masteries.items()
    }
    
    raw_weights = {
        s: max(gap, MAINTENANCE_FLOOR_ALPHA) for s, gap in deficiency_gaps.items()
    }
    
    normalized_weights = compute_normalized_weights(full_masteries)
    allocated_hours = allocate_weekly_clock_hours(normalized_weights, daily_study_hours)
    
    total_budget = round(float(daily_study_hours) * 7.0, 2)

    return {
        "weekly_budget_hours": total_budget,
        "daily_study_hours": daily_study_hours,
        "subject_masteries": full_masteries,
        "deficiency_gaps": deficiency_gaps,
        "raw_weights": raw_weights,
        "normalized_weights": {s: round(w, 4) for s, w in normalized_weights.items()},
        "allocated_hours": allocated_hours,
        "allocated_minutes": {s: int(round(h * 60)) for s, h in allocated_hours.items()}
    }
