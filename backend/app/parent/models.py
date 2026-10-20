from pydantic import BaseModel, Field
from typing import List, Optional


class ParentRegisterRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=4, max_length=100)
    student_username: str = Field(..., min_length=1, max_length=100)


class ParentLoginRequest(BaseModel):
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


class ParentAuthResponse(BaseModel):
    parent_id: str
    username: str
    full_name: str
    student_username: str
    student_id: int
    student_name: str


class ChildProfile(BaseModel):
    student_id: int
    first_name: str
    last_name: str
    full_name: str
    username: str
    standard_name: str
    school_name: Optional[str] = None
    medium: str
    study_goal: str
    daily_study_hours: float
    streak_days: int = 5


class LivePresence(BaseModel):
    is_online: bool = True
    last_active_text: str
    last_activity_title: str
    status_label: str = "Active"


class HealthMetric(BaseModel):
    metric_key: str
    title: str
    value: float
    formatted: str
    status_level: str  # 'high' | 'medium' | 'low'
    badge_label: str
    subtext: str
    explanation: str


class HealthOverview(BaseModel):
    study_discipline: HealthMetric
    average_retention: HealthMetric
    weekly_study_hours: HealthMetric
    weekly_target_hours: float
    completed_study_hours: float


class ActionableGuidanceItem(BaseModel):
    id: str
    category: str  # 'quiz_review' | 'consistency' | 'support_tip' | 'priority'
    action_type: Optional[str] = "Continue"  # 'Continue' | 'Practice' | 'Revise' | 'Assess' | 'Prioritize'
    situation: Optional[str] = ""
    title: str
    description: str  # Recommended Parent Action
    why_reason: Optional[str] = ""  # The 'Why' explanation
    try_saying: str
    tag: str
    subject_hint: Optional[str] = None


class SubjectMasteryCard(BaseModel):
    subject_id: int
    subject_name: str
    chapters_completed: int
    total_chapters: int
    progress_percentage: float
    quiz_average_percentage: float
    status_level: str  # 'high' | 'medium' | 'low' | 'in_progress'
    status_badge: str
    home_support_suggestion: str  # Recommended Parent Action
    action_type: Optional[str] = "Continue"  # 'Continue' | 'Practice' | 'Revise' | 'Assess' | 'Prioritize'
    action_reason: Optional[str] = ""  # The 'Why' explanation
    icon_name: str
    color_theme: str


class DailyAgendaBlock(BaseModel):
    id: str
    title: str
    time_range: str
    block_type: str  # 'school' | 'study' | 'break' | 'sleep'
    is_locked: bool
    status_badge: str
    details: str


class StudentCommitmentItem(BaseModel):
    id: str
    label: str
    commitment_type: str  # 'College' | 'Tuition' | 'Sports/Activity' | 'Travel' | 'Sleep' | 'Other'
    time_range: str
    start_time: str
    end_time: str
    recurrence_type: str  # 'WEEKLY_RECURRING' | 'SPECIFIC_DATE'
    recurrence_display: str
    days_of_week: List[str] = []
    specific_date: Optional[str] = None
    is_locked: bool = True
    badge_label: str = "Protected Commitment"
    color: Optional[str] = None


class ParentDashboardResponse(BaseModel):
    parent_info: ParentAuthResponse
    child_profile: ChildProfile
    live_presence: LivePresence
    health_overview: HealthOverview
    actionable_guidance: List[ActionableGuidanceItem]
    subject_mastery: List[SubjectMasteryCard]
    today_journey: List[DailyAgendaBlock]
    all_commitments: List[StudentCommitmentItem] = []


class SendHighFiveRequest(BaseModel):
    student_username: str
    sender_name: str
    message: Optional[str] = "Keep up the fantastic momentum! Super proud of your discipline tonight."


class HighFiveItem(BaseModel):
    id: str
    student_username: str
    sender_name: str
    message: str
    created_at: str
    acknowledged: bool = False
