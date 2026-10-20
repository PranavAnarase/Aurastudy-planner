"""
Unit tests for assessment assembly difficulty distribution (40/40/20 rule).
"""

from app.assessment.assessment_engine import compute_difficulty_counts


def test_10_question_distribution():
    counts = compute_difficulty_counts(10)
    assert counts["Easy"] == 4       # 40% of 10
    assert counts["Average"] == 4    # 40% of 10
    assert counts["Difficult"] == 2  # 20% of 10
    assert sum(counts.values()) == 10


def test_15_question_distribution():
    counts = compute_difficulty_counts(15)
    assert counts["Easy"] == 6       # 40% of 15
    assert counts["Average"] == 6    # 40% of 15
    assert counts["Difficult"] == 3  # 20% of 15
    assert sum(counts.values()) == 15


def test_12_question_distribution():
    counts = compute_difficulty_counts(12)
    assert sum(counts.values()) == 12
