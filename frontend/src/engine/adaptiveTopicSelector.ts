/**
 * AuraStudy Adaptive Recall Topic & Question Prioritization Engine
 * 
 * Mathematical Formulation:
 * Retention Urgency Score:
 *   U_k = w_recency * (studied_yesterday ? 2.0 : 1.0) + (days_since_review / stability) * (1.0 - mastery_score)
 * 
 * Invariants:
 * - Dynamic gap testing NEVER introduces new syllabus topics or chapters.
 * - Gaps are strictly reserved for active recall and error correction on studied material.
 */

import type {
  CandidateTopic,
  TestActivityType,
  DynamicSlot,
  DynamicTestPayload,
} from '../types/scheduler';

export const DEFAULT_W_RECENCY = 1.5;
export const DEFAULT_STABILITY_FACTOR = 2.0;

/**
 * Calculate cognitive retention urgency score Uk for a candidate topic
 */
export function calculateTopicUrgency(
  topic: CandidateTopic,
  wRecency: number = DEFAULT_W_RECENCY,
  defaultStability: number = DEFAULT_STABILITY_FACTOR
): number {
  // Normalize mastery score to [0.0, 1.0]
  const normalizedMastery = Math.min(1.0, Math.max(0.0, topic.masteryScore / 100.0));
  const deficiency = 1.0 - normalizedMastery;

  // Recency multiplier
  const recencyMultiplier = topic.wasStudiedYesterday ? 2.0 : 1.0;
  const recencyComponent = wRecency * recencyMultiplier;

  // Forgetting curve decay component
  const daysSince = Math.max(0, topic.daysSinceReview ?? 1);
  const stability = Math.max(0.5, topic.stabilityFactor ?? defaultStability);
  const decayComponent = (daysSince / stability) * deficiency;

  // Error boost if historical errors exist
  const errorBoost = topic.historicalErrorCount ? Math.min(2.0, topic.historicalErrorCount * 0.2) : 0;

  return recencyComponent + decayComponent + errorBoost;
}

/**
 * Topic Eligibility Gatekeeper:
 * Strictly exclude unstudied or locked chapters.
 */
export function filterEligibleTopics(topics: CandidateTopic[]): CandidateTopic[] {
  return topics.filter((t) => {
    // Must be unlocked
    if (!t.isUnlocked) return false;
    // Must be in progress, completed, or previously studied
    if (!t.isCompletedOrInProgress && t.masteryScore === 0 && !t.wasStudiedYesterday) {
      return false;
    }
    return true;
  });
}

/**
 * Shared mapping helper to build candidate topics from subjects and yesterday's completed chapters.
 */
export function buildCandidateTopics(
  subjects: Array<{ subject_name: string; chapters?: any[] }>,
  yesterdayCompletedChapters?: Set<number> | number[] | Array<{ chapter_id?: number; chapterId?: number; status?: string }>
): CandidateTopic[] {
  const yesterdayChapterIds = new Set<number>();
  if (yesterdayCompletedChapters) {
    if (yesterdayCompletedChapters instanceof Set) {
      yesterdayCompletedChapters.forEach((id) => yesterdayChapterIds.add(id));
    } else if (Array.isArray(yesterdayCompletedChapters)) {
      for (const item of yesterdayCompletedChapters) {
        if (typeof item === 'number') {
          yesterdayChapterIds.add(item);
        } else if (item && typeof item === 'object') {
          const cid = (item as any).chapter_id ?? (item as any).chapterId;
          if (cid && (!item.status || item.status === 'COMPLETED')) {
            yesterdayChapterIds.add(cid);
          }
        }
      }
    }
  }

  const candidates: CandidateTopic[] = [];

  for (const subj of subjects) {
    for (const ch of subj.chapters || []) {
      if (ch.is_locked === true) continue;
      const wasStudiedYesterday = yesterdayChapterIds.has(ch.chapter_id);
      const isCompletedOrInProgress = (ch.mastery_score || 0) > 0 || wasStudiedYesterday || Boolean(ch.is_due);

      const actualLastReviewDate = ch.last_reviewed_date || ch.last_review_date || ch.lastReviewedDate;

      let daysSinceReview = ch.interval_days ?? 1;
      if (actualLastReviewDate) {
        const lastDate = new Date(actualLastReviewDate);
        if (!isNaN(lastDate.getTime())) {
          const diffDays = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
          daysSinceReview = Math.max(0, diffDays);
        }
      } else if (ch.days_until_next_review !== undefined && ch.interval_days !== undefined) {
        daysSinceReview = Math.max(0, ch.interval_days - ch.days_until_next_review);
      }

      candidates.push({
        chapterId: ch.chapter_id,
        chapterName: ch.chapter_name,
        subjectName: subj.subject_name,
        masteryScore: ch.mastery_score ?? 0,
        lastReviewedDate: actualLastReviewDate ? String(actualLastReviewDate) : undefined,
        daysSinceReview,
        stabilityFactor: 2.0,
        wasStudiedYesterday,
        isUnlocked: ch.is_unlocked !== false,
        isCompletedOrInProgress,
      });
    }
  }

  return candidates;
}

/**
 * Rank candidate topics by cognitive urgency score descending
 */
export function rankTopicsByUrgency(
  topics: CandidateTopic[],
  wRecency: number = DEFAULT_W_RECENCY
): Array<CandidateTopic & { urgencyScore: number }> {
  const eligible = filterEligibleTopics(topics);

  return eligible
    .map((t) => ({
      ...t,
      urgencyScore: parseFloat(calculateTopicUrgency(t, wRecency).toFixed(3)),
    }))
    .sort((a, b) => b.urgencyScore - a.urgencyScore);
}

/**
 * Assemble payload for a dynamic testing slot based on activity type
 */
export function assembleTestPayload(
  slot: DynamicSlot,
  candidateTopics: CandidateTopic[]
): DynamicTestPayload {
  const ranked = rankTopicsByUrgency(candidateTopics);

  if (slot.activityType === 'FIRST_GAP_RETENTION_TEST') {
    // 70% yesterday's studied material, 30% decaying weak points
    const yesterdayTopics = ranked.filter((t) => t.wasStudiedYesterday);
    const weakTopics = ranked.filter((t) => !t.wasStudiedYesterday);

    const selectedTopics: Array<{ chapterId: number; chapterName: string; urgencyScore: number }> = [];

    // Prioritize yesterday's topics
    yesterdayTopics.slice(0, 3).forEach((t) => {
      selectedTopics.push({
        chapterId: t.chapterId,
        chapterName: t.chapterName,
        urgencyScore: t.urgencyScore,
      });
    });

    // Fill remainder with decaying weak points
    weakTopics.slice(0, 2).forEach((t) => {
      selectedTopics.push({
        chapterId: t.chapterId,
        chapterName: t.chapterName,
        urgencyScore: t.urgencyScore,
      });
    });

    return {
      slotId: slot.id,
      activityType: slot.activityType,
      durationMinutes: slot.durationMinutes,
      questionCount: slot.recommendedQuestionCount,
      topics: selectedTopics.length > 0 ? selectedTopics : ranked.slice(0, 3),
    };
  }

  if (slot.activityType === 'MICRO_DRILL') {
    // Target lowest mastery / highest error topics
    const drillTopics = [...ranked]
      .sort((a, b) => a.masteryScore - b.masteryScore)
      .slice(0, 2)
      .map((t) => ({
        chapterId: t.chapterId,
        chapterName: t.chapterName,
        urgencyScore: t.urgencyScore,
      }));

    return {
      slotId: slot.id,
      activityType: slot.activityType,
      durationMinutes: slot.durationMinutes,
      questionCount: slot.recommendedQuestionCount,
      topics: drillTopics.length > 0 ? drillTopics : ranked.slice(0, 2),
    };
  }

  // SPACED_REVISION_QUIZ (mastery < 60%)
  const spacedTopics = ranked
    .filter((t) => t.masteryScore < 60)
    .slice(0, 3)
    .map((t) => ({
      chapterId: t.chapterId,
      chapterName: t.chapterName,
      urgencyScore: t.urgencyScore,
    }));

  return {
    slotId: slot.id,
    activityType: slot.activityType,
    durationMinutes: slot.durationMinutes,
    questionCount: slot.recommendedQuestionCount,
    topics: spacedTopics.length > 0 ? spacedTopics : ranked.slice(0, 3),
  };
}
