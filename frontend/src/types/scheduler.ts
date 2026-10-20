/**
 * AuraStudy Pure Dynamic Time-Gap Scheduler & Active Recall Engine Types
 * 
 * Invariants:
 * - Operable Domain: Ω = [360, 1320] minutes from midnight (06:00 AM to 10:00 PM).
 * - Sleep Window: [1320, 1440) ∪ [0, 360) is strictly locked out.
 */

export interface Interval {
  id?: string;
  startMinutes: number; // minutes from midnight [0, 1440)
  endMinutes: number;   // minutes from midnight [0, 1440)
  label?: string;
}

export interface TimeGap {
  startMinutes: number;
  endMinutes: number;
  durationMinutes: number;
  isFirstPostSleepGap: boolean;
}

export type TestActivityType =
  | 'FIRST_GAP_RETENTION_TEST'
  | 'MICRO_DRILL'
  | 'SPACED_REVISION_QUIZ';

export interface DynamicSlot {
  id: string;
  activityType: TestActivityType;
  title: string;
  subtitle: string;
  startMinutes: number;
  endMinutes: number;
  durationMinutes: number;
  displayStartTime: string;
  displayEndTime: string;
  contentRatio?: {
    priorDayPercent: number;
    decayingWeakPercent: number;
  };
  recommendedQuestionCount: number;
  targetTopicIds?: number[];
  targetTopics?: Array<{
    chapterId: number;
    chapterName: string;
    subjectName: string;
    masteryScore: number;
    urgencyScore: number;
  }>;
}

export interface CandidateTopic {
  chapterId: number;
  chapterName: string;
  subjectName: string;
  masteryScore: number;       // 0 - 100
  lastReviewedDate?: string;  // ISO "YYYY-MM-DD"
  daysSinceReview?: number;
  stabilityFactor?: number;   // default 1.0 - 5.0
  wasStudiedYesterday?: boolean;
  isUnlocked: boolean;
  isCompletedOrInProgress: boolean;
  historicalErrorCount?: number;
}

export interface QuestionBankItem {
  question_id: number;
  chapter_id: number;
  chapter_name: string;
  subject_name?: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  options: string[];
  correct_option: string;
  correct_index: number;
  difficulty: string;
  explanation?: string;
  marks?: number;
}

export interface DynamicRecallQuestionsResponse {
  student_id: number;
  total_questions: number;
  activity_type: string;
  questions: QuestionBankItem[];
}

export interface DynamicTestPayload {
  slotId: string;
  activityType: TestActivityType;
  durationMinutes: number;
  topics: Array<{
    chapterId: number;
    chapterName: string;
    urgencyScore: number;
  }>;
  questionCount: number;
  questions?: QuestionBankItem[];
}

