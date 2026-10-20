export interface ParentAuthResponse {
  parent_id: string;
  username: string;
  full_name: string;
  student_username: string;
  student_id: number;
  student_name: string;
}

export interface ChildProfile {
  student_id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  username: string;
  standard_name: string;
  school_name?: string;
  medium: string;
  study_goal: string;
  daily_study_hours: number;
  streak_days: number;
}

export interface LivePresence {
  is_online: boolean;
  last_active_text: string;
  last_activity_title: string;
  status_label: string;
}

export interface HealthMetric {
  metric_key: string;
  title: string;
  value: number;
  formatted: string;
  status_level: 'high' | 'medium' | 'low';
  badge_label: string;
  subtext: string;
  explanation: string;
}

export interface HealthOverview {
  study_discipline: HealthMetric;
  average_retention: HealthMetric;
  weekly_study_hours: HealthMetric;
  weekly_target_hours: number;
  completed_study_hours: number;
}

export interface ActionableGuidanceItem {
  id: string;
  category: 'quiz_review' | 'consistency' | 'support_tip' | 'priority' | string;
  action_type?: 'Continue' | 'Practice' | 'Revise' | 'Assess' | 'Prioritize' | string;
  situation?: string;
  title: string;
  description: string;
  why_reason?: string;
  try_saying: string;
  tag: string;
  subject_hint?: string;
}

export interface SubjectMasteryCard {
  subject_id: number;
  subject_name: string;
  chapters_completed: number;
  total_chapters: number;
  progress_percentage: number;
  quiz_average_percentage: number;
  status_level: 'high' | 'medium' | 'low' | string;
  status_badge: string;
  home_support_suggestion: string;
  action_type?: 'Continue' | 'Practice' | 'Revise' | 'Assess' | 'Prioritize' | string;
  action_reason?: string;
  icon_name: string;
  color_theme: string;
}

export interface DailyAgendaBlock {
  id: string;
  title: string;
  time_range: string;
  block_type: 'school' | 'study' | 'break' | 'sleep';
  is_locked: boolean;
  status_badge: string;
  details: string;
}

export interface StudentCommitmentItem {
  id: string;
  label: string;
  commitment_type: 'College' | 'Tuition' | 'Sports/Activity' | 'Travel' | 'Sleep' | 'Other' | string;
  time_range: string;
  start_time: string;
  end_time: string;
  recurrence_type: 'WEEKLY_RECURRING' | 'SPECIFIC_DATE' | string;
  recurrence_display: string;
  days_of_week?: string[];
  specific_date?: string | null;
  is_locked: boolean;
  badge_label: string;
  color?: string | null;
}

export interface ParentDashboardResponse {
  parent_info: ParentAuthResponse;
  child_profile: ChildProfile;
  live_presence: LivePresence;
  health_overview: HealthOverview;
  actionable_guidance: ActionableGuidanceItem[];
  subject_mastery: SubjectMasteryCard[];
  today_journey: DailyAgendaBlock[];
  all_commitments?: StudentCommitmentItem[];
}
