"""
GreedyPlanner Strategy.

Selects chapters by sorting candidates in descending order of their
value/cost (value/time) ratio, adding them until the time budget is exhausted.
"""

from typing import List
from .planner_strategy import PlannerStrategy


class GreedyPlanner(PlannerStrategy):
    def plan_day(self, candidates: List[dict], time_budget_minutes: int) -> List[dict]:
        """
        Sorts candidates by value/cost descending and takes what fits.
        """
        # Sort by ratio descending; avoid divide-by-zero by checking cost > 0
        sorted_candidates = sorted(
            candidates,
            key=lambda x: (x['value'] / x['cost']) if x['cost'] > 0 else 0.0,
            reverse=True
        )

        selected = []
        remaining_budget = time_budget_minutes
        
        # Track allocated minutes per subject to prevent single-subject dominance
        subject_allocated = {}
        has_multiple_subjects = len(set(c.get('metadata', {}).get('subject_name', 'General') for c in candidates)) > 1
        max_subject_limit = int(time_budget_minutes * 0.7) if has_multiple_subjects else time_budget_minutes

        for item in sorted_candidates:
            cost = item['cost']
            sub_name = item.get('metadata', {}).get('subject_name', 'General')
            current_sub_alloc = subject_allocated.get(sub_name, 0)
            
            if cost <= remaining_budget and (current_sub_alloc + cost) <= max_subject_limit:
                selected.append(item)
                remaining_budget -= cost
                subject_allocated[sub_name] = current_sub_alloc + cost

        return selected
