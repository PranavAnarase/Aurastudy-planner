"""
WeeklyBinPacker — Pure Logic (no DB/network calls)

Distributes chapters across 7 days using a modified First-Fit-Decreasing (FFD)
heuristic. Bins correspond to days 1 to 7, each with daily_study_hours capacity.
Subject monotony rule: avoids scheduling the same subject on more than 2 consecutive days.
"""

from typing import List, Dict, Any


class WeeklyBinPacker:
    @classmethod
    def pack_chapters(
        cls,
        chapters: List[dict],
        daily_study_hours: float,
        num_days: int = 7
    ) -> List[Dict[str, Any]]:
        """
        Packs chapters into bins (days).
        
        Parameters
        ----------
        chapters : List of due chapter dicts, sorted in descending order of priority.
                   Each has:
                     - 'chapter_id': int
                     - 'cost': int (allocated minutes, e.g. 45)
                     - 'subject_id': int
                     - 'subject_name': str
                     - 'chapter_name': str
        daily_study_hours : Float capacity in hours (e.g. 2.0).
        num_days : Total bins (default 7 days).

        Returns
        -------
        A list of days, where each day has:
          - 'day_number': int (1 to 7)
          - 'allocated_minutes': int
          - 'capacity_minutes': int
          - 'tasks': List[dict]
        """
        capacity_minutes = int(daily_study_hours * 60)
        
        # Initialize bins
        bins = []
        for i in range(1, num_days + 1):
            bins.append({
                "day_number": i,
                "allocated_minutes": 0,
                "capacity_minutes": capacity_minutes,
                "tasks": [],
                # Track scheduled subjects on this day
                "subjects": set()
            })

        for ch in chapters:
            cost = ch['cost']
            sub_id = ch['subject_id']

            def would_violate_monotony(idx: int, s_id: int) -> bool:
                # Monotony: cannot be scheduled on more than 2 consecutive days
                if idx >= 2 and s_id in bins[idx-1]["subjects"] and s_id in bins[idx-2]["subjects"]:
                    return True
                if idx >= 1 and idx < len(bins) - 1 and s_id in bins[idx-1]["subjects"] and s_id in bins[idx+1]["subjects"]:
                    return True
                if idx <= len(bins) - 3 and s_id in bins[idx+1]["subjects"] and s_id in bins[idx+2]["subjects"]:
                    return True
                return False

            placed = False
            # First-Fit: try each day in order
            for idx in range(len(bins)):
                day = bins[idx]
                if day["allocated_minutes"] + cost <= capacity_minutes:
                    if not would_violate_monotony(idx, sub_id):
                        day["tasks"].append(ch)
                        day["allocated_minutes"] += cost
                        day["subjects"].add(sub_id)
                        placed = True
                        break

            # Fallback: Bypass capacity limits ONLY if the day is empty (to accommodate tasks larger than daily capacity)
            if not placed:
                for idx in range(len(bins)):
                    day = bins[idx]
                    if day["allocated_minutes"] == 0 and not would_violate_monotony(idx, sub_id):
                        day["tasks"].append(ch)
                        day["allocated_minutes"] += cost
                        day["subjects"].add(sub_id)
                        placed = True
                        break

        # Convert set of subjects to list for JSON serialization
        for day in bins:
            if "subjects" in day:
                del day["subjects"]

        return bins
