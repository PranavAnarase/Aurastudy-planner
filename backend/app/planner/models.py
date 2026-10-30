"""
Planner Pydantic models.
"""

from pydantic import BaseModel, Field
from datetime import date, datetime
from typing import List, Optional, Dict, Any


class GenerateDailyPlanRequest(BaseModel):
    student_id: int
    plan_date: date
    strategy: str = Field(default="knapsack", description="knapsack | greedy")
    force_regenerate: bool = False


class TaskModel(BaseModel):
    task_id: int
    chapter_id: int
    chapter_name: str
    subject_name: str
    allocated_minutes: int
    status: str
    carried_forward_from_task_id: Optional[int] = None
    completed_at: Optional[datetime] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    current_stage: Optional[str] = "CONCEPT_STUDY"
    concept_completed: Optional[bool] = False
    practice_completed: Optional[bool] = False
    recall_completed: Optional[bool] = False
    assessment_unlocked: Optional[bool] = False
    mastery_score: Optional[float] = None


class DailyPlanResponse(BaseModel):
    student_id: int
    plan_date: date
    strategy_used: str
    total_allocated_minutes: int
    capacity_minutes: Optional[int] = 180
    tasks: List[TaskModel]
    comparison: Optional[Dict[str, Any]] = None



class PatchTaskRequest(BaseModel):
    status: str = Field(..., description="COMPLETED | IN_PROGRESS | SKIPPED")


class PatchTaskResponse(BaseModel):
    task_id: int
    status: str
    message: str


class GenerateWeeklyPlanRequest(BaseModel):
    student_id: int


class WeeklyDayTaskModel(BaseModel):
    chapter_id: int
    chapter_name: str
    subject_name: str
    cost: int
    current_stage: Optional[str] = "CONCEPT_STUDY"
    concept_completed: Optional[bool] = False
    practice_completed: Optional[bool] = False
    recall_completed: Optional[bool] = False
    assessment_unlocked: Optional[bool] = False



class WeeklyDayPlanModel(BaseModel):
    day_number: int
    date: Optional[str] = None
    formatted_date: Optional[str] = None
    is_today: Optional[bool] = False
    allocated_minutes: int
    capacity_minutes: int
    tasks: List[WeeklyDayTaskModel]


class WeeklyPlanResponse(BaseModel):
    student_id: int
    week_start_date: Optional[str] = None
    week_end_date: Optional[str] = None
    days: List[WeeklyDayPlanModel]


class CommitmentBlockModel(BaseModel):
    id: str
    label: str
    recurrence_type: str = Field(default="WEEKLY_RECURRING", description="WEEKLY_RECURRING | SPECIFIC_DATE")
    days_of_week: Optional[List[str]] = Field(default_factory=list)
    specific_date: Optional[str] = None
    start_time: str
    end_time: str
    block_category: str = Field(default="GENERAL", description="Domain category: SCHOOL | TUITION | SPORTS | TRAVEL | SLEEP | GENERAL")
    color: Optional[str] = None  # Deprecated UI field


class UpdateCommitmentsRequest(BaseModel):
    commitments: List[CommitmentBlockModel]


class CommitmentsResponse(BaseModel):
    student_id: int
    commitments: List[CommitmentBlockModel]


class DynamicSlotModel(BaseModel):
    id: str
    activity_type: str
    title: str
    subtitle: str
    start_minutes: int
    end_minutes: int
    duration_minutes: int
    display_start_time: str
    display_end_time: str
    content_ratio: Optional[Dict[str, Any]] = None
    recommended_question_count: int


class GenerateDynamicSlotsRequest(BaseModel):
    student_id: int
    plan_date: date
    commitments: Optional[List[Dict[str, Any]]] = None


class GenerateDynamicSlotsResponse(BaseModel):
    student_id: int
    plan_date: date
    dynamic_slots: List[DynamicSlotModel]
    total_dynamic_minutes: int


