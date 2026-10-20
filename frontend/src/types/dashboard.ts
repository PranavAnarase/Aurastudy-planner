/**
 * AuraStudy Time Management Dashboard — TypeScript Types
 *
 * All types are derived directly from existing backend API responses.
 * No invented fields. No duplicate calculations.
 *
 * Tier classification mirrors backend tier_actions.py:
 *   Critical  → mastery_score < 50
 *   Developing → mastery_score 50–74
 *   Mastered   → mastery_score >= 75
 */

// ─────────────────────────────────────────────
// Mastery Tier (mirrors tier_actions.py exactly)
// ─────────────────────────────────────────────
export type MasteryTier = 'Critical' | 'Developing' | 'Mastered';

/** Derive MasteryTier from a numeric mastery_score. Pure function, no API call. */
export function deriveTier(masteryScore: number): MasteryTier {
  if (masteryScore < 50) return 'Critical';
  if (masteryScore < 75) return 'Developing';
  return 'Mastered';
}

/** Human-readable deficiency = 100 - mastery. Pure function. */
export function deriveDeficiency(masteryScore: number): number {
  return Math.max(0, Math.round(100 - masteryScore));
}

// ─────────────────────────────────────────────
// Why-This-Chapter explanation
// Derived purely from existing mastery + tier data.
// No duplicate calculation — just translates existing values into language.
// ─────────────────────────────────────────────
export function deriveWhyExplanation(
  tier: MasteryTier,
  masteryScore: number,
  isCarriedForward: boolean,
  isSpacedReview: boolean
): string {
  if (isSpacedReview) {
    return 'This chapter is scheduled for revision based on your review schedule.';
  }
  if (isCarriedForward) {
    return 'This chapter was not completed yesterday and has been carried forward to today.';
  }
  if (tier === 'Critical') {
    return `Your recent performance is low (${Math.round(masteryScore)}% mastery). This chapter needs more focused practice.`;
  }
  if (tier === 'Developing') {
    return `You understand most of this chapter (${Math.round(masteryScore)}% mastery) but need more practice to improve further.`;
  }
  return `Your recent performance is consistently strong (${Math.round(masteryScore)}% mastery). A short revision keeps it fresh.`;
}

/** Today's recommended activity — derived from current_stage, not invented. */
export function deriveActivityDescription(
  stage: string | undefined,
  tier: MasteryTier
): string {
  if (stage === 'CONCEPT_STUDY')      return 'Read through the key concepts and study the main ideas.';
  if (stage === 'PRACTICE_DRILL')     return 'Solve practice questions to strengthen your understanding.';
  if (stage === 'ACTIVE_RECALL')      return 'Test yourself by recalling key facts without looking at notes.';
  if (stage === 'READY_FOR_ASSESSMENT') return 'You are ready — take the chapter assessment.';
  if (stage === 'COMPLETED') {
    return tier === 'Mastered'
      ? 'Short revision to maintain your strong performance.'
      : 'Review and re-attempt practice questions to rebuild mastery.';
  }
  // Fallback: derive from tier alone
  if (tier === 'Critical')   return 'Focus on foundational concepts and basic practice questions.';
  if (tier === 'Developing') return 'Practice questions and active recall exercises.';
  return 'Short revision to keep your knowledge fresh.';
}

// ─────────────────────────────────────────────
// Unavailability Block (localStorage-backed, no DB)
// ─────────────────────────────────────────────
export type CommitmentType =
  | 'College'
  | 'Tuition'
  | 'Travel'
  | 'Sports/Activity'
  | 'Break'
  | 'Other';

export type RecurrenceType = 'WEEKLY_RECURRING' | 'SPECIFIC_DATE';
export type DayOfWeek = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

export interface UnavailabilityBlock {
  id: string;               // unique ID
  label: CommitmentType | string;
  recurrenceType?: RecurrenceType; // defaults to 'WEEKLY_RECURRING'
  daysOfWeek?: DayOfWeek[];        // e.g. ['MON', 'TUE', 'WED', 'THU', 'FRI']
  specificDate?: string;           // "YYYY-MM-DD" if recurrenceType === 'SPECIFIC_DATE'
  startTime: string;        // "HH:MM" 24h
  endTime: string;          // "HH:MM" 24h
  color?: string;           // optional override
}

// ─────────────────────────────────────────────
// Time Slot — the core unit of the time grid
// ─────────────────────────────────────────────
export type SlotKind = 'study' | 'revision' | 'unavailable' | 'free' | 'break' | 'dynamic_test';

export interface BaseSlot {
  id: string;
  kind: SlotKind;
  startTime: string;   // display string e.g. "08:00 AM"
  endTime: string;     // display string e.g. "08:45 AM"
  startMinutes: number; // minutes from midnight, for sorting/overlap
  endMinutes: number;
  durationMinutes: number;
}

export interface DynamicTestSlot extends BaseSlot {
  kind: 'dynamic_test';
  activityType: 'FIRST_GAP_RETENTION_TEST' | 'MICRO_DRILL' | 'SPACED_REVISION_QUIZ';
  title: string;
  subtitle: string;
  questionCount: number;
  badgeLabel: string;
  targetTopics?: Array<{
    chapterId: number;
    chapterName: string;
    subjectName: string;
    masteryScore: number;
  }>;
}

export interface StudySlot extends BaseSlot {
  kind: 'study';
  taskId: number;
  chapterId: number;
  chapterName: string;
  subjectName: string;
  allocatedMinutes: number;
  status: string;           // PENDING | IN_PROGRESS | COMPLETED | SKIPPED
  currentStage?: string;
  masteryScore: number;     // from chapters/available, 0 if not yet assessed
  hasBeenAssessed: boolean; // true only if mastery_score > 0
  tier: MasteryTier;
  deficiency: number;
  whyExplanation: string;
  activityDescription: string;
  isCarriedForward: boolean;
  isSpacedReview: boolean;
  nextReviewDate?: string | null;
}

export interface RevisionSlot extends BaseSlot {
  kind: 'revision';
  chapterId: number;
  chapterName: string;
  subjectName: string;
  masteryScore: number;
  hasBeenAssessed: boolean;
  tier: MasteryTier;
  daysOverdue: number;
}

export interface UnavailableSlot extends BaseSlot {
  kind: 'unavailable';
  label: string;
  commitmentType: CommitmentType | string;
}

export interface FreeSlot extends BaseSlot {
  kind: 'free';
}

export interface BreakSlot extends BaseSlot {
  kind: 'break';
}

export type TimeSlot =
  | StudySlot
  | RevisionSlot
  | UnavailableSlot
  | FreeSlot
  | BreakSlot
  | DynamicTestSlot;

// ─────────────────────────────────────────────
// Dashboard Summary Counts
// ─────────────────────────────────────────────
export interface DashboardSummary {
  date: Date;
  totalAvailableMinutes: number;
  plannedStudyMinutes: number;
  criticalCount: number;
  developingCount: number;
  masteredCount: number;
  todayFocusChapter?: string;
  todayFocusSubject?: string;
  todayFocusReason?: string;
  todayFocusTier?: MasteryTier;
}

// ─────────────────────────────────────────────
// API response shapes (what we receive from the backend)
// ─────────────────────────────────────────────

/** From POST /planner/daily */
export interface DailyPlanTask {
  task_id: number;
  chapter_id: number;
  chapter_name: string;
  subject_name: string;
  allocated_minutes: number;
  status: string;
  start_time?: string;
  end_time?: string;
  current_stage?: string;
  concept_completed?: boolean;
  practice_completed?: boolean;
  recall_completed?: boolean;
  assessment_unlocked?: boolean;
  carried_forward_from_task_id?: number | null;
}

export interface DailyPlanResponse {
  student_id: number;
  plan_date: string;
  strategy_used: string;
  total_allocated_minutes: number;
  capacity_minutes: number;
  tasks: DailyPlanTask[];
}

/** From GET /assessment/chapters/available/{student_id} */
export interface ChapterInfo {
  chapter_id: number;
  chapter_name: string;
  chapter_number: number;
  mastery_score: number;
  confidence: string;
  interval_days: number;
  next_review_date?: string | null;
  is_due?: boolean;
  is_locked?: boolean;
  is_unlocked?: boolean;
  unlock_requirement?: string | null;
}

export interface SubjectInfo {
  subject_id: number;
  subject_name: string;
  subject_mastery_score: number;
  subject_confidence: string;
  mastered_chapters_count: number;
  active_chapters_count: number;
  total_chapters_count: number;
  learning_gap: number;
  chapters: ChapterInfo[];
}

export interface AvailableChaptersResponse {
  student_id: number;
  standard_id: number;
  subjects: SubjectInfo[];
}

/** From GET /progress/subjects/{student_id} */
export interface SubjectCriticality {
  subject_name: string;
  subject_mastery: number;
  deficiency_gap: number;
  criticality_index: number;
  normalized_weight: number;
  tier: string;
  confidence: string;
  days_per_week: string;
  block_duration_minutes: number;
}

export interface SubjectProgressResponse {
  student_id: number;
  standard_id: number;
  subjects: SubjectCriticality[];
}

/** From GET /assessment/spaced-reviews/due/{student_id} */
export interface DueReview {
  chapter_id: number;
  chapter_name: string;
  chapter_number: number;
  subject_id: number;
  subject_name: string;
  mastery_score: number;
  confidence: string;
  interval_days: number;
  next_review_date: string;
  days_overdue: number;
}

export interface DueReviewsResponse {
  student_id: number;
  total_due: number;
  reviews: DueReview[];
}
