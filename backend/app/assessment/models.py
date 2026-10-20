"""
Pydantic Request and Response Models for Standard 7 Assessment & Rebalancing API.
"""

from pydantic import BaseModel, Field
from typing import List, Dict, Optional
from datetime import date


class QuestionOptionItem(BaseModel):
    option_key: str
    option_text: Optional[str] = None


class AssessmentQuestionItem(BaseModel):
    question_id: int
    question_order: int
    question_text: str
    difficulty: str
    marks: int
    estimated_seconds: int = 60
    option_a: Optional[str] = None
    option_b: Optional[str] = None
    option_c: Optional[str] = None
    option_d: Optional[str] = None


class StartAssessmentRequest(BaseModel):
    student_id: int
    total_questions: int = Field(default=10, ge=10, le=15)


class StartAssessmentResponse(BaseModel):
    assessment_id: int
    student_id: int
    chapter_id: int
    chapter_name: str
    subject_name: str
    attempt_number: int
    total_questions: int
    total_marks: int
    estimated_total_seconds: int
    questions: List[AssessmentQuestionItem]


class QuestionSubmissionItem(BaseModel):
    question_id: int
    selected_option: Optional[str] = None  # 'A', 'B', 'C', 'D' or None
    time_taken_seconds: int = 0


class SubmitAssessmentRequest(BaseModel):
    student_id: int
    responses: List[QuestionSubmissionItem]


class QuestionReviewItem(BaseModel):
    question_id: int
    question_text: str
    difficulty: str
    selected_option: Optional[str] = None
    correct_option: Optional[str] = None
    is_correct: bool
    explanation: Optional[str] = None
    time_taken_seconds: int
    ai_concept_gap: Optional[str] = None
    ai_misconception_feedback: Optional[str] = None
    ai_memory_tip: Optional[str] = None


class MasteryUpdateDetails(BaseModel):
    old_mastery: Optional[float]
    raw_score: float
    updated_mastery: float
    confidence: str
    interval_days: int
    next_review_date: date


class TierActionDetails(BaseModel):
    tier: str
    action_summary: str
    recommendation: str
    days_per_week: str
    block_duration_minutes: int
    unlock_next_chapter: bool


class TimetableAllocationImpact(BaseModel):
    weekly_budget_hours: float
    daily_study_hours: float
    subject_masteries: Dict[str, float]
    deficiency_gaps: Dict[str, float]
    raw_weights: Dict[str, float]
    normalized_weights: Dict[str, float]
    allocated_hours: Dict[str, float]
    allocated_minutes: Dict[str, int]


class SubmitAssessmentResponse(BaseModel):
    assessment_id: int
    student_id: int
    chapter_id: int
    attempt_number: int
    total_questions: int
    obtained_marks: float
    total_marks: float
    accuracy: float
    raw_score: float
    ai_overall_summary: Optional[str] = None
    mastery_update: MasteryUpdateDetails
    tier_actions: TierActionDetails
    rebalanced_timetable: TimetableAllocationImpact
    question_results: List[QuestionReviewItem]



class DueSpacedReviewItem(BaseModel):
    chapter_id: int
    chapter_name: str
    chapter_number: int
    subject_id: int
    subject_name: str
    mastery_score: float
    confidence: str
    interval_days: int
    next_review_date: date
    days_overdue: int


class DueSpacedReviewsResponse(BaseModel):
    student_id: int
    total_due: int
    reviews: List[DueSpacedReviewItem]


class StartSpacedReviewResponse(BaseModel):
    assessment_id: int
    student_id: int
    chapter_id: int
    chapter_name: str
    subject_name: str
    total_questions: int
    total_marks: int
    estimated_total_seconds: int
    questions: List[AssessmentQuestionItem]


class SubmitSpacedReviewResponse(BaseModel):
    assessment_id: int
    student_id: int
    chapter_id: int
    raw_score: float
    passed: bool
    old_mastery: float
    new_mastery: float
    old_interval_days: int
    new_interval_days: int
    confidence: str
    next_review_date: date
    trigger_rebalance: bool
    ai_overall_summary: Optional[str] = None
    rebalanced_timetable: Optional[TimetableAllocationImpact] = None
    question_results: List[QuestionReviewItem]


class DynamicRecallQuestionsRequest(BaseModel):
    student_id: int
    chapter_ids: List[int]
    question_count: int = Field(default=8, ge=1, le=30)
    activity_type: Optional[str] = "MICRO_DRILL"


class DynamicRecallQuestionItem(BaseModel):
    question_id: int
    chapter_id: int
    chapter_name: str
    subject_name: Optional[str] = None
    question_text: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    options: List[str]
    correct_option: str       # 'A' | 'B' | 'C' | 'D'
    correct_index: int        # 0 | 1 | 2 | 3
    difficulty: str           # 'Easy' | 'Average' | 'Difficult'
    explanation: Optional[str] = None
    marks: float = 1.0


class DynamicRecallQuestionsResponse(BaseModel):
    student_id: int
    total_questions: int
    activity_type: str
    questions: List[DynamicRecallQuestionItem]


