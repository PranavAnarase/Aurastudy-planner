"""
Subject-Wise Criticality & Progressive Chapter Gating Engine for Standard 7.

Core Operational Rules:
1. Closed-Loop Feedback: Instant update from Standard 7 chapter assessments into schedule.
2. Deficiency-Driven Allocation: Study hours distributed based on subject deficiency gaps.
3. Subject-Wise Mastery Control: M_s = sum(chapter_masteries) / total_chapters_in_subject.
4. Targeted Sub-Section Focus: High subject criticality schedules lowest-scoring unlocked chapters.
5. Progressive Chapter Unlocking (Gated Access): Chapter k+1 locked while Chapter k < 50%.
6. Maintenance Floor: alpha = 15% mandatory floor for all subjects.
7. Adaptive Updating: 40/60 EMA blend (40% historical baseline, 60% recent performance).
"""

from typing import Dict, List, Any, Optional
from app.assessment.tier_actions import classify_performance_tier

STANDARD_7_SUBJECTS = [
    "Mathematics",
    "General Science",
    "History & Civics",
    "Geography",
    "English",
    "Hindi",
    "Marathi"
]

MAINTENANCE_FLOOR_ALPHA = 15.0


class SubjectCriticalityEngine:
    @staticmethod
    def normalize_subject_name(name: str) -> str:
        """
        Maps arbitrary/DB subject name variations into the 7 canonical Standard 7 subjects.
        """
        name_lower = name.lower()
        if "math" in name_lower:
            return "Mathematics"
        elif "science" in name_lower or "environmental studies part 1" in name_lower:
            return "General Science"
        elif "history" in name_lower or "civics" in name_lower or "environmental studies part 2" in name_lower:
            return "History & Civics"
        elif "geography" in name_lower:
            return "Geography"
        elif "english" in name_lower:
            return "English"
        elif "hindi" in name_lower:
            return "Hindi"
        elif "marathi" in name_lower:
            return "Marathi"
        return name

    @classmethod
    def compute_subject_masteries(
        cls,
        chapters: List[Dict[str, Any]],
        chapter_masteries_map: Dict[int, float],
        default_unassessed: Optional[float] = None
    ) -> Dict[str, float]:
        """
        Calculates aggregate subject-wise mastery scores (M_s) across all chapters of each subject.
        """
        # Group chapters by canonical subject name
        subject_chapters: Dict[str, List[int]] = {s: [] for s in STANDARD_7_SUBJECTS}
        for ch in chapters:
            sub_raw = ch.get("subject_name", "")
            canon_name = cls.normalize_subject_name(sub_raw)
            if canon_name not in subject_chapters:
                subject_chapters[canon_name] = []
            subject_chapters[canon_name].append(ch["chapter_id"])

        subject_masteries: Dict[str, float] = {}
        for subj, ch_ids in subject_chapters.items():
            if not ch_ids:
                subject_masteries[subj] = default_unassessed if default_unassessed is not None else 0.0
                continue

            if default_unassessed is not None:
                scores = [
                    float(chapter_masteries_map[cid]) if (cid in chapter_masteries_map and float(chapter_masteries_map[cid]) > 0) else default_unassessed
                    for cid in ch_ids
                ]
                avg_mastery = sum(scores) / len(scores)
            else:
                attempted_scores = [
                    float(chapter_masteries_map[cid])
                    for cid in ch_ids
                    if cid in chapter_masteries_map and float(chapter_masteries_map[cid]) > 0
                ]
                avg_mastery = (sum(attempted_scores) / len(attempted_scores)) if attempted_scores else 0.0

            subject_masteries[subj] = max(0.0, min(100.0, round(avg_mastery, 2)))

        return subject_masteries


    @classmethod
    def evaluate_progressive_chapter_gating(
        cls,
        chapters: List[Dict[str, Any]],
        chapter_masteries_map: Dict[int, float]
    ) -> Dict[int, Dict[str, Any]]:
        """
        Evaluates progressive visibility and access gating for each chapter.
        Rule:
        - Chapter 1 in every subject is always UNLOCKED.
        - Chapter k+1 is LOCKED if Chapter k has mastery score < 50.0% (Critical tier).
        - Chapter k+1 UNLOCKS once Chapter k achieves >= 50.0% (Developing or Mastered).
        
        Returns:
            dict mapping chapter_id -> {
                "is_locked": bool,
                "is_unlocked": bool,
                "prerequisite_chapter_id": Optional[int],
                "prerequisite_chapter_name": Optional[str],
                "unlock_requirement": Optional[str]
            }
        """
        # Group chapters by canonical subject and sort by chapter_number
        subject_groups: Dict[str, List[Dict[str, Any]]] = {}
        for ch in chapters:
            sub_name = cls.normalize_subject_name(ch.get("subject_name", ""))
            subject_groups.setdefault(sub_name, []).append(ch)

        gating_results: Dict[int, Dict[str, Any]] = {}

        for subj, ch_list in subject_groups.items():
            sorted_ch = sorted(ch_list, key=lambda x: (x.get("chapter_number", 0), x.get("display_order", 0)))
            
            for i, ch in enumerate(sorted_ch):
                cid = ch["chapter_id"]
                if i == 0:
                    # Chapter 1 is always unlocked
                    gating_results[cid] = {
                        "is_locked": False,
                        "is_unlocked": True,
                        "prerequisite_chapter_id": None,
                        "prerequisite_chapter_name": None,
                        "unlock_requirement": None
                    }
                else:
                    prev_ch = sorted_ch[i - 1]
                    prev_cid = prev_ch["chapter_id"]
                    prev_name = prev_ch.get("chapter_name", f"Chapter {prev_ch.get('chapter_number', i)}")
                    prev_score = float(chapter_masteries_map.get(prev_cid, 0.0))
                    
                    # Previous chapter must also be unlocked and have cleared >= 50%
                    prev_unlocked = gating_results.get(prev_cid, {}).get("is_unlocked", True)
                    
                    if prev_unlocked and prev_score >= 50.0:
                        gating_results[cid] = {
                            "is_locked": False,
                            "is_unlocked": True,
                            "prerequisite_chapter_id": prev_cid,
                            "prerequisite_chapter_name": prev_name,
                            "unlock_requirement": None
                        }
                    else:
                        gating_results[cid] = {
                            "is_locked": True,
                            "is_unlocked": False,
                            "prerequisite_chapter_id": prev_cid,
                            "prerequisite_chapter_name": prev_name,
                            "unlock_requirement": f"Achieve ≥ 50% mastery on {prev_name} (Current: {prev_score:.1f}%)"
                        }

        return gating_results

    @classmethod
    def calculate_subject_criticalities(
        cls,
        subject_masteries: Dict[str, float],
        floor_alpha: float = MAINTENANCE_FLOOR_ALPHA
    ) -> Dict[str, Dict[str, Any]]:
        """
        Executes Step 3 & Step 4 of the Deficiency Rebalancing Algorithm:
        - Deficiency Gap = 100% - M_s
        - Raw Weight W_s = max(Deficiency Gap, floor_alpha)
        - Normalized Weight W_bar_s = W_s / sum(W_i)
        - Criticality Index = W_bar_s * 100
        - Tier Specification & Workflow Mapping
        """
        # Ensure all 7 core subjects are present
        full_masteries = {s: 50.0 for s in STANDARD_7_SUBJECTS}
        for k, v in subject_masteries.items():
            canon = cls.normalize_subject_name(k)
            full_masteries[canon] = float(v)

        deficiency_gaps = {s: max(0.0, round(100.0 - m, 2)) for s, m in full_masteries.items()}
        raw_weights = {s: max(gap, floor_alpha) for s, gap in deficiency_gaps.items()}
        total_raw = sum(raw_weights.values()) or 1.0

        normalized_weights = {s: raw_weights[s] / total_raw for s in full_masteries}

        results: Dict[str, Dict[str, Any]] = {}
        for s in full_masteries:
            mastery = full_masteries[s]
            tier_info = classify_performance_tier(mastery)
            norm_w = normalized_weights[s]

            results[s] = {
                "subject_name": s,
                "subject_mastery": mastery,
                "deficiency_gap": deficiency_gaps[s],
                "raw_weight": raw_weights[s],
                "normalized_weight": norm_w,
                "criticality_index": round(norm_w * 100.0, 2),
                "tier": tier_info["tier"],
                "confidence": tier_info["confidence"],
                "days_per_week": tier_info["days_per_week"],
                "block_duration_minutes": tier_info["block_duration_minutes"],
                "unlock_next_chapter": tier_info["unlock_next_chapter"],
                "interval_days": tier_info["interval_days"],
                "action_summary": tier_info["action_summary"]
            }

        return results

    @classmethod
    def compute_composite_chapter_priority(
        cls,
        subject_criticality_weight: float,
        chapter_mastery_score: float,
        days_overdue: int = 0
    ) -> float:
        """
        Combines Subject Criticality Weight with Chapter Deficiency to prioritize tasks.
        Formula: Composite Priority = W_bar_s * (days_overdue + 1.0) * (100.0 - chapter_mastery)
        """
        chapter_deficiency = max(0.0, 100.0 - float(chapter_mastery_score))
        urgency_multiplier = max(1.0, float(days_overdue) + 1.0)
        composite = float(subject_criticality_weight) * urgency_multiplier * chapter_deficiency
        return round(composite, 4)
