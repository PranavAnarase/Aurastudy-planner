/**
 * AuraStudy Pure Dynamic Time-Gap Scheduler Engine
 * 
 * Invariant System Boundaries:
 * - Operable Domain: Ω = [360, 1320] minutes from midnight (06:00 AM to 10:00 PM).
 * - Universal Sleep Window: [1320, 1440) ∪ [0, 360) is strictly locked out.
 * - Zero hardcoded clock brackets: all decisions relative to gap duration Δk,
 *   proximity to sleep boundary, and contextual sequence.
 */

import type {
  Interval,
  TimeGap,
  DynamicSlot,
  TestActivityType,
} from '../types/scheduler';

export const WAKE_MINUTE = 360;  // 06:00 AM
export const SLEEP_MINUTE = 1320; // 10:00 PM
export const MIN_GAP_THRESHOLD = 20; // Gaps < 20 mins are human transition buffers

/**
 * Convert time string ("HH:MM" 24h or "HH:MM AM/PM" 12h) to integer scalar minutes from midnight [0, 1439]
 */
export function timeStringToMinutes(timeStr: string): number {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const trimmed = timeStr.trim();

  // Try 12-hour format with AM/PM (e.g., "08:30 AM", "6:00 PM", "12:15 pm")
  const match12 = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = parseInt(match12[2], 10);
    const isPM = match12[3].toUpperCase() === 'PM';

    if (hours === 12) {
      hours = isPM ? 12 : 0;
    } else if (isPM) {
      hours += 12;
    }
    return Math.min(1439, Math.max(0, hours * 60 + minutes));
  }

  // Try 24-hour format (e.g., "09:00", "18:30", "6:15")
  const parts = trimmed.split(':');
  if (parts.length >= 2) {
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    if (!isNaN(hours) && !isNaN(minutes)) {
      return Math.min(1439, Math.max(0, hours * 60 + minutes));
    }
  }

  return 0;
}

/**
 * Convert integer scalar minutes from midnight to "hh:mm AM/PM" (12h format)
 */
export function minutesToTimeString(totalMinutes: number): string {
  const normalized = ((Math.floor(totalMinutes) % 1440) + 1440) % 1440;
  const h24 = Math.floor(normalized / 60);
  const mins = normalized % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const displayHours = h24 % 12 === 0 ? 12 : h24 % 12;
  const displayMins = mins.toString().padStart(2, '0');
  return `${displayHours.toString().padStart(2, '0')}:${displayMins} ${period}`;
}

/**
 * Clamps an interval to the operable waking domain [wakeMin, sleepMin]
 */
export function clampInterval(
  interval: Interval,
  wakeMin: number = WAKE_MINUTE,
  sleepMin: number = SLEEP_MINUTE
): Interval | null {
  const start = Math.max(wakeMin, Math.min(sleepMin, interval.startMinutes));
  const end = Math.max(wakeMin, Math.min(sleepMin, interval.endMinutes));
  if (end <= start) return null;
  return {
    ...interval,
    startMinutes: start,
    endMinutes: end,
  };
}

/**
 * Merge contiguous and overlapping intervals in O(n log n) time complexity
 */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  if (!intervals || intervals.length === 0) return [];

  // Filter out invalid intervals (end <= start) and sort by startMinutes ascending
  const valid = intervals
    .filter((inv) => inv.endMinutes > inv.startMinutes)
    .sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes);

  if (valid.length === 0) return [];

  const merged: Interval[] = [{ ...valid[0] }];

  for (let i = 1; i < valid.length; i++) {
    const current = valid[i];
    const prev = merged[merged.length - 1];

    // If current starts before or exactly at prev ends, they overlap or are contiguous
    if (current.startMinutes <= prev.endMinutes) {
      prev.endMinutes = Math.max(prev.endMinutes, current.endMinutes);
      if (current.label && prev.label && !prev.label.includes(current.label)) {
        prev.label = `${prev.label} / ${current.label}`;
      }
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

/**
 * Available Gap Extraction: G = Ω \ B_total
 * Computes available unallocated time gaps within [wakeMin, sleepMin]
 */
export function extractDynamicGaps(
  blockedIntervals: Interval[],
  wakeMin: number = WAKE_MINUTE,
  sleepMin: number = SLEEP_MINUTE
): TimeGap[] {
  // 1. Clamp all blocked intervals to [wakeMin, sleepMin]
  const clamped: Interval[] = [];
  for (const inv of blockedIntervals) {
    const c = clampInterval(inv, wakeMin, sleepMin);
    if (c) clamped.push(c);
  }

  // 2. Merge overlapping and contiguous blocked intervals
  const mergedBlocked = mergeIntervals(clamped);

  // 3. Difference Engine: Walk across Ω = [wakeMin, sleepMin]
  const gaps: TimeGap[] = [];
  let cursor = wakeMin;

  for (const block of mergedBlocked) {
    if (block.startMinutes > cursor) {
      const duration = block.startMinutes - cursor;
      gaps.push({
        startMinutes: cursor,
        endMinutes: block.startMinutes,
        durationMinutes: duration,
        isFirstPostSleepGap: cursor === wakeMin,
      });
    }
    cursor = Math.max(cursor, block.endMinutes);
  }

  // Final gap trailing to sleep boundary
  if (cursor < sleepMin) {
    const duration = sleepMin - cursor;
    gaps.push({
      startMinutes: cursor,
      endMinutes: sleepMin,
      durationMinutes: duration,
      isFirstPostSleepGap: cursor === wakeMin,
    });
  }

  return gaps;
}

/**
 * Pure Relative Classification and Test Slot Generation
 * 
 * Rules:
 * 1. If Δk < 20 mins: Discard as human buffer / transit.
 * 2. If k == 1 and start_1 == 360 (First gap immediately post-sleep):
 *    - Activity: FIRST_GAP_RETENTION_TEST
 *    - Buffer: 15 mins post-wake routine
 *    - Duration: min(45, Δ1 - 15), requires duration >= 20 mins.
 *    - Content: 70% prior day study consolidation, 30% decaying weak points.
 * 3. If 20 <= Δk < 45 mins:
 *    - Activity: MICRO_DRILL
 *    - Duration: Exactly Δk.
 *    - Content: 5-8 rapid flashcards / error-bank speed drills.
 * 4. If Δk >= 45 mins:
 *    - Activity: SPACED_REVISION_QUIZ
 *    - Duration: Exactly 30 mins, centered with rest buffers:
 *      offset = floor((Δk - 30) / 2), start = start_k + offset.
 *    - Content: Spaced repetition diagnostic targeting topics with mastery < 60%.
 */
export function generateAdaptiveTestSlots(
  commitments: Interval[] = [],
  plannedStudySlots: Interval[] = [],
  wakeMin: number = WAKE_MINUTE,
  sleepMin: number = SLEEP_MINUTE
): DynamicSlot[] {
  // Combine all blocked intervals
  const allBlocked: Interval[] = [...commitments, ...plannedStudySlots];
  const gaps = extractDynamicGaps(allBlocked, wakeMin, sleepMin);

  const dynamicSlots: DynamicSlot[] = [];

  gaps.forEach((gap, index) => {
    const { startMinutes, endMinutes, durationMinutes, isFirstPostSleepGap } = gap;

    // Rule 1: Ignore micro-gaps < 20 minutes
    if (durationMinutes < MIN_GAP_THRESHOLD) {
      return;
    }

    // Rule 2: Post-sleep retention test (First gap starting at 06:00 AM)
    if (isFirstPostSleepGap && startMinutes === wakeMin) {
      const WAKE_BUFFER_MINUTES = 15;
      const testStart = startMinutes + WAKE_BUFFER_MINUTES;
      const testDuration = Math.min(45, durationMinutes - WAKE_BUFFER_MINUTES);

      // Only schedule if remaining duration >= 20 minutes
      if (testDuration >= MIN_GAP_THRESHOLD) {
        const testEnd = testStart + testDuration;
        const qCount = testDuration >= 40 ? 15 : testDuration >= 30 ? 12 : 10;

        dynamicSlots.push({
          id: `dynamic-post-sleep-${testStart}`,
          activityType: 'FIRST_GAP_RETENTION_TEST',
          title: 'Post-Sleep Recall Test',
          subtitle: 'Consolidate memory from yesterday’s study sessions',
          startMinutes: testStart,
          endMinutes: testEnd,
          durationMinutes: testDuration,
          displayStartTime: minutesToTimeString(testStart),
          displayEndTime: minutesToTimeString(testEnd),
          contentRatio: {
            priorDayPercent: 70,
            decayingWeakPercent: 30,
          },
          recommendedQuestionCount: qCount,
        });
        return;
      }
    }

    // Rule 3: Short Gaps [20, 45) minutes -> MICRO_DRILL
    if (durationMinutes >= MIN_GAP_THRESHOLD && durationMinutes < 45) {
      const qCount = durationMinutes >= 35 ? 8 : durationMinutes >= 25 ? 6 : 5;

      dynamicSlots.push({
        id: `dynamic-micro-drill-${startMinutes}`,
        activityType: 'MICRO_DRILL',
        title: 'Rapid Micro-Drill',
        subtitle: 'Quick error-correction & high-yield flashcards',
        startMinutes: startMinutes,
        endMinutes: endMinutes,
        durationMinutes: durationMinutes,
        displayStartTime: minutesToTimeString(startMinutes),
        displayEndTime: minutesToTimeString(endMinutes),
        recommendedQuestionCount: qCount,
      });
      return;
    }

    // Rule 4: Large Gaps >= 45 minutes -> Centered 30-min SPACED_REVISION_QUIZ
    if (durationMinutes >= 45) {
      const QUIZ_DURATION = 30;
      const offset = Math.floor((durationMinutes - QUIZ_DURATION) / 2);
      const quizStart = startMinutes + offset;
      const quizEnd = quizStart + QUIZ_DURATION;

      dynamicSlots.push({
        id: `dynamic-spaced-quiz-${quizStart}`,
        activityType: 'SPACED_REVISION_QUIZ',
        title: 'Spaced Revision Quiz',
        subtitle: 'Targeting foundational concepts with mastery < 60%',
        startMinutes: quizStart,
        endMinutes: quizEnd,
        durationMinutes: QUIZ_DURATION,
        displayStartTime: minutesToTimeString(quizStart),
        displayEndTime: minutesToTimeString(quizEnd),
        recommendedQuestionCount: 10,
      });
    }
  });

  return dynamicSlots;
}
