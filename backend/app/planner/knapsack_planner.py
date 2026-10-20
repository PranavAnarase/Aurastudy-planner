"""
KnapsackPlanner Strategy.

Implements the 0/1 Knapsack optimization via dynamic programming:
- Value: weakness * exam_weight * overdue_ness
- Cost: estimated study minutes
- Time Complexity: O(n * W) where n is candidate count, W is time budget.
"""

from typing import List
from .planner_strategy import PlannerStrategy


class KnapsackPlanner(PlannerStrategy):
    def plan_day(self, candidates: List[dict], time_budget_minutes: int) -> List[dict]:
        """
        Solves 0/1 Knapsack using a 2D DP array.
        Returns the subset of candidates that maximizes total value within the time budget.
        """
        n = len(candidates)
        W = time_budget_minutes

        if n == 0 or W <= 0:
            return []

        # dp[i][w] represents max value using first i items with budget w
        dp = [[0.0] * (W + 1) for _ in range(n + 1)]

        for i in range(1, n + 1):
            item = candidates[i - 1]
            cost = item['cost']
            val = item['value']

            for w in range(W + 1):
                if cost > w:
                    dp[i][w] = dp[i - 1][w]
                else:
                    dp[i][w] = max(dp[i - 1][w], dp[i - 1][w - cost] + val)

        # Backtrack to find chosen items
        selected = []
        w = W
        
        # Track allocated minutes per subject to prevent single-subject dominance
        subject_allocated = {}
        has_multiple_subjects = len(set(c.get('metadata', {}).get('subject_name', 'General') for c in candidates)) > 1
        max_subject_limit = int(W * 0.7) if has_multiple_subjects else W

        for i in range(n, 0, -1):
            if dp[i][w] != dp[i - 1][w]:
                item = candidates[i - 1]
                sub_name = item.get('metadata', {}).get('subject_name', 'General')
                cost = item['cost']
                current_sub_alloc = subject_allocated.get(sub_name, 0)
                
                if (current_sub_alloc + cost) <= max_subject_limit:
                    selected.append(item)
                    w -= cost
                    subject_allocated[sub_name] = current_sub_alloc + cost

        # Reverse to maintain original order of selection
        selected.reverse()
        return selected
