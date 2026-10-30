/**
 * TimeManagementDashboard — AuraStudy Student Time Management View.
 *
 * DATA FLOW:
 *   POST /planner/daily          → daily tasks (start_time, end_time, stage, status)
 *   GET  /assessment/chapters/available/{id} → per-chapter mastery_score, confidence, tier
 *   GET  /progress/subjects/{id} → subject criticality counts (Critical/Developing/Mastered)
 *   localStorage                 → student-defined unavailability blocks
 *
 *   All data assembled here into TimeSlot[] → passed to TimeGrid (pure presentation).
 *
 * IMPORTANT:
 * - No mastery calculations done here. Uses deriveTier() which mirrors tier_actions.py.
 * - No planner algorithm here. Displays planner's existing output.
 * - Aptitude data is never fetched or used here.
 * - Assessment access is never gated by this component.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertCircle, LayoutGrid } from 'lucide-react';
import DashboardHeader from './dashboard/DashboardHeader';
import TimeGrid from './dashboard/TimeGrid';
import PerformanceSummary from './dashboard/PerformanceSummary';
import DynamicRecallTestModal from './dashboard/DynamicRecallTestModal';
import {
  loadUnavailabilityBlocks,
} from './dashboard/UnavailabilityManager';

import {
  generateAdaptiveTestSlots,
  minutesToTimeString,
} from '../engine/timeGapScheduler';

import {
  rankTopicsByUrgency,
  assembleTestPayload,
  buildCandidateTopics,
} from '../engine/adaptiveTopicSelector';

import {
  deriveTier,
  deriveDeficiency,
  deriveWhyExplanation,
  deriveActivityDescription,
} from '../types/dashboard';

import {
  getCompletedDynamicSlots,
  fetchCompletedDynamicSlots,
  markDynamicSlotCompleted,
  formatLocalDate,
} from '../utils/completedTests';

import type {
  TimeSlot,
  StudySlot,
  RevisionSlot,
  UnavailableSlot,
  FreeSlot,
  BreakSlot,
  DynamicTestSlot,
  UnavailabilityBlock,
  DailyPlanTask,
  SubjectInfo,
  DashboardSummary,
  ChapterInfo,
  DayOfWeek,
} from '../types/dashboard';
import type { CandidateTopic } from '../types/scheduler';
import { AURASTUDY_V1_PREFIX } from '../config/api';

// ── Time helpers ──────────────────────────────────────────────────────────────

/** Parse "HH:MM" (24h) to minutes from midnight */
function parseHHMM(t: string): number {
  const parts = t.split(':');
  if (parts.length < 2) return 0;
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

/** Parse "HH:MM AM/PM" (12h) to minutes from midnight */
function parse12hToMinutes(t: string): number {
  if (!t) return 0;
  const match = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) {
    // try plain HH:MM
    if (/^\d{2}:\d{2}$/.test(t)) return parseHHMM(t);
    return 0;
  }
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const pm = match[3].toUpperCase() === 'PM';
  if (pm && h !== 12) h += 12;
  if (!pm && h === 12) h = 0;
  return h * 60 + m;
}

/** Format minutes-from-midnight to "HH:MM AM/PM" */
function minsToDisplay(mins: number): string {
  const h24 = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const displayH = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${displayH}:${m.toString().padStart(2, '0')} ${period}`;
}

// ── Slot assembly ─────────────────────────────────────────────────────────────

function buildChapterMap(subjects: SubjectInfo[]): Map<number, ChapterInfo> {
  const map = new Map<number, ChapterInfo>();
  for (const subj of subjects) {
    for (const ch of subj.chapters) {
      map.set(ch.chapter_id, ch);
    }
  }
  return map;
}

/**
 * Filter subjects to only include chapters the student has UNLOCKED
 * but has NOT yet fully mastered (mastery_score < 75 or never assessed).
 * Locked chapters (prerequisite not met) are excluded entirely.
 */
function filterToActiveChapters(subjects: SubjectInfo[]): SubjectInfo[] {
  return subjects
    .map((subj) => ({
      ...subj,
      chapters: subj.chapters.filter(
        (ch) =>
          ch.is_unlocked !== false &&
          ch.is_locked !== true &&
          ch.mastery_score < 75
      ),
    }))
    .filter((subj) => subj.chapters.length > 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFLICT RESOLUTION ENGINE
//
// When a commitment block overlaps an existing study task, we cannot move the
// backend task (it's immutable from the API's perspective for today).
// What we CAN do on the frontend display layer is:
//
//  1. Identify every study task that overlaps with any commitment block.
//  2. For each conflicted study task, split the remaining study minutes into
//     a new display slot that is pushed to start right after the commitment ends.
//  3. If a study task starts *before* the commitment begins, show the pre-conflict
//     portion as a truncated study slot, then the commitment, then the remaining
//     duration continues after.
//  4. Insert 5-min breaks between consecutive study-display slots.
//  5. Fill any gaps ≥ 10 min with free slots.
//
// The rearranged slots are DISPLAY-ONLY — we never mutate the backend tasks.
// ─────────────────────────────────────────────────────────────────────────────

interface RawStudyBlock {
  taskId: number;
  chapterId: number;
  chapterName: string;
  subjectName: string;
  allocatedMinutes: number;
  status: string;
  currentStage?: string;
  masteryScore: number;
  hasBeenAssessed: boolean;
  tier: import('../types/dashboard').MasteryTier;
  deficiency: number;
  whyExplanation: string;
  activityDescription: string;
  isCarriedForward: boolean;
  nextReviewDate?: string | null;
  isSpacedReview: boolean;
  // original backend times (used as the base for scheduling)
  originalStartMins: number;
  originalEndMins: number;
}

interface CommitmentInterval {
  id: string;
  label: string;
  startMins: number;
  endMins: number;
}

/**
 * Core scheduler: given study blocks and commitment intervals, produce a
 * final ordered list of display slots with no overlaps.
 *
 * Algorithm:
 *  1. Sort commitment intervals by start time.
 *  2. Walk through study blocks in their original order.
 *     For each block, maintain a "cursor" = earliest available start time.
 *     - Skip over any commitment that starts before the cursor (already passed).
 *     - If a commitment overlaps with [cursor, cursor+duration]:
 *         a) If cursor < commitment.start → emit a partial study segment
 *            covering [cursor, commitment.start].
 *         b) Emit the commitment block (unavailable).
 *         c) Advance cursor to commitment.end + BREAK.
 *         d) Subtract the portion already emitted from remaining duration.
 *         e) Repeat until all duration is placed.
 *     - Emit the remaining study segment starting at cursor.
 *     - Advance cursor by (remaining duration + BREAK) for next block.
 */
const BREAK_MINS = 5;

const DAY_OF_WEEK_MAP: DayOfWeek[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function filterBlocksForDate(blocks: UnavailabilityBlock[], targetDate: Date): UnavailabilityBlock[] {
  const dayCode = DAY_OF_WEEK_MAP[targetDate.getDay()];
  const targetIso = formatLocalDate(targetDate);

  return blocks.filter((b) => {
    const recType = b.recurrenceType || 'WEEKLY_RECURRING';
    if (recType === 'SPECIFIC_DATE') {
      return b.specificDate === targetIso;
    }
    // WEEKLY_RECURRING
    if (!b.daysOfWeek || b.daysOfWeek.length === 0) {
      return true; // legacy/all days
    }
    return b.daysOfWeek.includes(dayCode);
  });
}

function buildSlotsFromTasks(
  tasks: DailyPlanTask[],
  chapterMap: Map<number, ChapterInfo>,
  unavailBlocks: UnavailabilityBlock[],
  subjects: SubjectInfo[] = [],
  activeDate: Date = new Date(),
  completedSlotIds: string[] = []
): TimeSlot[] {
  // ── 1. Build raw study blocks ───────────────────────────────────────────
  const rawBlocks: RawStudyBlock[] = [];

  for (const task of tasks) {
    if (!task.start_time || !task.end_time) continue;
    const chInfo = chapterMap.get(task.chapter_id);
    const masteryScore = chInfo?.mastery_score ?? 0;
    const hasBeenAssessed = masteryScore > 0;
    const tier = deriveTier(masteryScore);
    const deficiency = deriveDeficiency(masteryScore);
    const isCarriedForward = Boolean(task.carried_forward_from_task_id);
    const isSpacedReview =
      task.current_stage === 'COMPLETED' && hasBeenAssessed && deficiency < 30;

    rawBlocks.push({
      taskId:             task.task_id,
      chapterId:          task.chapter_id,
      chapterName:        task.chapter_name,
      subjectName:        task.subject_name,
      allocatedMinutes:   task.allocated_minutes,
      status:             task.status,
      currentStage:       task.current_stage,
      masteryScore,
      hasBeenAssessed,
      tier,
      deficiency,
      whyExplanation:     deriveWhyExplanation(tier, masteryScore, isCarriedForward, isSpacedReview),
      activityDescription: deriveActivityDescription(task.current_stage, tier),
      isCarriedForward,
      nextReviewDate:     chInfo?.next_review_date ?? null,
      isSpacedReview,
      originalStartMins:  parse12hToMinutes(task.start_time),
      originalEndMins:    parse12hToMinutes(task.end_time),
    });
  }

  // ── 2. Build commitment intervals, sorted by start ─────────────────────
  const dayFilteredBlocks = filterBlocksForDate(unavailBlocks, activeDate);
  const commitments: CommitmentInterval[] = dayFilteredBlocks
    .map((b) => ({
      id:        b.id,
      label:     b.label,
      startMins: parseHHMM(b.startTime),
      endMins:   parseHHMM(b.endTime),
    }))
    .filter((c) => c.endMins > c.startMins)
    .sort((a, b) => a.startMins - b.startMins);

  // Merge overlapping commitments into contiguous intervals so the scheduler
  // treats adjacent/overlapping blocks as one combined unavailable period.
  const mergedCommitments: CommitmentInterval[] = [];
  for (const c of commitments) {
    const last = mergedCommitments[mergedCommitments.length - 1];
    if (last && c.startMins <= last.endMins) {
      last.endMins = Math.max(last.endMins, c.endMins);
      last.label = last.label === c.label ? last.label : `${last.label} / ${c.label}`;
    } else {
      mergedCommitments.push({ ...c });
    }
  }

  // ── 3. Schedule: walk each raw block and emit display slots ────────────
  const finalSlots: TimeSlot[] = [];

  // Track which commitments have already been emitted (de-duplicate)
  const emittedCommitmentIds = new Set<string>();

  let cursor =
    rawBlocks.length > 0 ? rawBlocks[0].originalStartMins : 0;

  // Pre-emit any commitment blocks that start before the first study task
  for (const c of mergedCommitments) {
    if (c.startMins < cursor && !emittedCommitmentIds.has(c.id)) {
      finalSlots.push(makeUnavailSlot(c));
      emittedCommitmentIds.add(c.id);
    }
  }

  for (let bi = 0; bi < rawBlocks.length; bi++) {
    const block = rawBlocks[bi];
    let remainingMins = block.allocatedMinutes;
    let segmentIndex = 0;

    if (block.originalStartMins > cursor) {
      const gapStart = cursor;
      const gapEnd = block.originalStartMins;

      for (const c of mergedCommitments) {
        if (
          c.startMins < gapEnd &&
          c.endMins > gapStart &&
          !emittedCommitmentIds.has(c.id)
        ) {
          if (c.startMins > cursor && c.startMins - cursor >= 10) {
            finalSlots.push(makeFreeSlot(`pregap-${c.id}-${bi}`, cursor, c.startMins));
          }
          finalSlots.push(makeUnavailSlot(c));
          emittedCommitmentIds.add(c.id);
          cursor = Math.max(cursor, c.endMins + BREAK_MINS);
        }
      }
      if (block.originalStartMins > cursor && block.originalStartMins - cursor >= 10) {
        finalSlots.push(makeFreeSlot(`gap-${bi}`, cursor, block.originalStartMins));
      }
      cursor = block.originalStartMins;
    }

    while (remainingMins > 0) {
      const nextConflict = mergedCommitments.find(
        (c) =>
          !emittedCommitmentIds.has(c.id) &&
          c.startMins < cursor + remainingMins &&
          c.endMins > cursor
      );

      if (!nextConflict) {
        const segEnd = cursor + remainingMins;
        finalSlots.push(
          makeStudySlot(block, cursor, segEnd, segmentIndex, remainingMins)
        );
        cursor = segEnd;
        remainingMins = 0;
      } else if (nextConflict.startMins > cursor) {
        const beforeMins = nextConflict.startMins - cursor;
        finalSlots.push(
          makeStudySlot(block, cursor, nextConflict.startMins, segmentIndex, beforeMins)
        );
        remainingMins -= beforeMins;
        segmentIndex++;
        cursor = nextConflict.startMins;

        finalSlots.push(makeUnavailSlot(nextConflict));
        emittedCommitmentIds.add(nextConflict.id);
        cursor = nextConflict.endMins + BREAK_MINS;
      } else {
        finalSlots.push(makeUnavailSlot(nextConflict));
        emittedCommitmentIds.add(nextConflict.id);
        cursor = Math.max(cursor, nextConflict.endMins) + BREAK_MINS;
      }
    }

    if (bi < rawBlocks.length - 1) {
      finalSlots.push(makeBreakSlot(block.taskId, cursor, cursor + BREAK_MINS));
      cursor += BREAK_MINS;
    }
  }

  // ── 4. Emit any remaining commitments that fall after all study tasks ──
  for (const c of mergedCommitments) {
    if (!emittedCommitmentIds.has(c.id)) {
      if (c.startMins > cursor && c.startMins - cursor >= 10) {
        finalSlots.push(makeFreeSlot(`postend-${c.id}`, cursor, c.startMins));
      }
      finalSlots.push(makeUnavailSlot(c));
      emittedCommitmentIds.add(c.id);
      cursor = c.endMins + BREAK_MINS;
    }
  }

  // ── 5. Generate and Interleave Pure Dynamic Adaptive Test Slots ────────
  const candidateTopics = buildCandidateTopics(subjects, tasks);
  const rankedTopics = rankTopicsByUrgency(candidateTopics);

  if (rankedTopics.length > 0) {
    const plannedStudyIntervals = rawBlocks.map((b) => ({
      startMinutes: b.originalStartMins,
      endMinutes: b.originalEndMins,
      label: b.chapterName,
    }));

    const commitmentIntervals = mergedCommitments.map((c) => ({
      startMinutes: c.startMins,
      endMinutes: c.endMins,
      label: c.label,
    }));

    const dynamicSlots = generateAdaptiveTestSlots(commitmentIntervals, plannedStudyIntervals);

    for (const dyn of dynamicSlots) {
      if (completedSlotIds.includes(dyn.id)) {
        continue; // Never show completed dynamic recall tests again
      }

      const payload = assembleTestPayload(dyn, candidateTopics);
      const targetTopics = payload.topics.map((t) => {
        const match = rankedTopics.find((r) => r.chapterId === t.chapterId);
        return {
          chapterId: t.chapterId,
          chapterName: match?.chapterName || t.chapterName,
          subjectName: match?.subjectName || '',
          masteryScore: match?.masteryScore ?? 0,
        };
      });

      finalSlots.push({
        id: dyn.id,
        kind: 'dynamic_test',
        activityType: dyn.activityType,
        title: dyn.title,
        subtitle: dyn.subtitle,
        startTime: dyn.displayStartTime,
        endTime: dyn.displayEndTime,
        startMinutes: dyn.startMinutes,
        endMinutes: dyn.endMinutes,
        durationMinutes: dyn.durationMinutes,
        questionCount: dyn.recommendedQuestionCount,
        badgeLabel: dyn.activityType === 'FIRST_GAP_RETENTION_TEST'
          ? 'Post-Sleep Test'
          : dyn.activityType === 'MICRO_DRILL'
          ? 'Micro-Drill'
          : 'Spaced Quiz',
        targetTopics,
      });
    }
  }

  // ── 6. Sort final slots chronologically ───────────────────────────────
  return finalSlots.sort((a, b) => a.startMinutes - b.startMinutes);
}

// ── Slot factory helpers ──────────────────────────────────────────────────────

function makeStudySlot(
  block: RawStudyBlock,
  startMins: number,
  endMins: number,
  segIdx: number,
  displayMinutes: number
): StudySlot | RevisionSlot {
  const id =
    segIdx === 0
      ? `study-${block.taskId}`
      : `study-${block.taskId}-seg${segIdx}`;

  const base = {
    startTime:      minsToDisplay(startMins),
    endTime:        minsToDisplay(endMins),
    startMinutes:   startMins,
    endMinutes:     endMins,
    durationMinutes: displayMinutes,
  };

  if (block.isSpacedReview) {
    const rev: RevisionSlot = {
      id,
      kind:           'revision',
      ...base,
      chapterId:      block.chapterId,
      chapterName:    block.chapterName,
      subjectName:    block.subjectName,
      masteryScore:   block.masteryScore,
      hasBeenAssessed: block.hasBeenAssessed,
      tier:           block.tier,
      daysOverdue:    0,
    };
    return rev;
  }

  const study: StudySlot = {
    id,
    kind:               'study',
    ...base,
    taskId:             block.taskId,
    chapterId:          block.chapterId,
    chapterName:        block.chapterName,
    subjectName:        block.subjectName,
    allocatedMinutes:   block.allocatedMinutes,
    status:             block.status,
    currentStage:       block.currentStage,
    masteryScore:       block.masteryScore,
    hasBeenAssessed:    block.hasBeenAssessed,
    tier:               block.tier,
    deficiency:         block.deficiency,
    whyExplanation:     block.whyExplanation,
    activityDescription: block.activityDescription,
    isCarriedForward:   block.isCarriedForward,
    isSpacedReview:     false,
    nextReviewDate:     block.nextReviewDate,
  };
  return study;
}

function makeUnavailSlot(c: CommitmentInterval): UnavailableSlot {
  return {
    id:              `unavail-${c.id}`,
    kind:            'unavailable',
    startTime:       minsToDisplay(c.startMins),
    endTime:         minsToDisplay(c.endMins),
    startMinutes:    c.startMins,
    endMinutes:      c.endMins,
    durationMinutes: c.endMins - c.startMins,
    label:           c.label,
    commitmentType:  c.label as any,
  };
}

function makeBreakSlot(taskId: number, startMins: number, endMins: number): BreakSlot {
  return {
    id:              `break-${taskId}`,
    kind:            'break',
    startTime:       minsToDisplay(startMins),
    endTime:         minsToDisplay(endMins),
    startMinutes:    startMins,
    endMinutes:      endMins,
    durationMinutes: endMins - startMins,
  };
}

function makeFreeSlot(id: string, startMins: number, endMins: number): FreeSlot {
  return {
    id:              `free-${id}`,
    kind:            'free',
    startTime:       minsToDisplay(startMins),
    endTime:         minsToDisplay(endMins),
    startMinutes:    startMins,
    endMinutes:      endMins,
    durationMinutes: endMins - startMins,
  };
}

function buildSummary(
  date: Date,
  tasks: DailyPlanTask[],
  capacityMinutes: number,
  subjects: SubjectInfo[]
): DashboardSummary {
  const plannedStudyMinutes = tasks.reduce((s, t) => s + t.allocated_minutes, 0);
  const totalAvailableMinutes = capacityMinutes;

  // Count tiers across all chapters in all subjects
  let criticalCount = 0, developingCount = 0, masteredCount = 0;
  for (const subj of subjects) {
    for (const ch of subj.chapters) {
      const t = deriveTier(ch.mastery_score);
      if (t === 'Critical') criticalCount++;
      else if (t === 'Developing') developingCount++;
      else masteredCount++;
    }
  }

  // Today's focus = highest-priority task (first planned task, as ordered by planner)
  const firstTask = tasks.find((t) => t.status !== 'COMPLETED' && t.status !== 'SKIPPED');
  let todayFocusChapter: string | undefined;
  let todayFocusSubject: string | undefined;
  let todayFocusTier: DashboardSummary['todayFocusTier'];
  let todayFocusReason: string | undefined;

  if (firstTask) {
    todayFocusChapter = firstTask.chapter_name;
    todayFocusSubject = firstTask.subject_name;
    // We can't easily get mastery here without chapterMap — parent handles this in the useMemo below
  }

  return {
    date,
    totalAvailableMinutes,
    plannedStudyMinutes,
    criticalCount,
    developingCount,
    masteredCount,
    todayFocusChapter,
    todayFocusSubject,
    todayFocusTier,
    todayFocusReason,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

interface TimeManagementDashboardProps {
  studentId: number;
  /** Injected so we don't make a duplicate profile call (App.tsx already has it) */
  preferredStudyStartTime?: string;  // eslint-disable-line @typescript-eslint/no-unused-vars
  dailyStudyHours?: number;
}

export default function TimeManagementDashboard({
  studentId,
  dailyStudyHours = 3,
}: TimeManagementDashboardProps) {

  const [tasks, setTasks] = useState<DailyPlanTask[]>([]);
  const [capacityMinutes, setCapacityMinutes] = useState(dailyStudyHours * 60);
  const [subjects, setSubjects] = useState<SubjectInfo[]>([]);
  const [unavailBlocks, setUnavailBlocks] = useState<UnavailabilityBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate] = useState(new Date());

  // ── Fetch ────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const todayStr = formatLocalDate(selectedDate);

      const [dailyRes, chaptersRes] = await Promise.all([
        fetch(`${AURASTUDY_V1_PREFIX}/planner/daily`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            student_id: studentId,
            plan_date: todayStr,
            strategy: 'knapsack',
            force_regenerate: false,
          }),
        }),
        fetch(`${AURASTUDY_V1_PREFIX}/assessment/chapters/available?user_id=${encodeURIComponent(String(studentId))}`),
      ]);

      if (!dailyRes.ok) {
        const errData = await dailyRes.json().catch(() => ({}));
        const msg = (errData as any)?.detail || 'Unable to load today\'s study plan.';
        throw new Error(msg);
      }
      if (!chaptersRes.ok) {
        throw new Error('Unable to load chapter information.');
      }

      const dailyData = await dailyRes.json();
      const chaptersData = await chaptersRes.json();

      setTasks(dailyData.tasks ?? []);
      setCapacityMinutes(dailyData.capacity_minutes ?? dailyStudyHours * 60);
      setSubjects(chaptersData.subjects ?? []);
    } catch (err: any) {
      setError(err.message ?? 'Unable to load today\'s study plan.');
    } finally {
      setLoading(false);
    }
  }, [studentId, selectedDate, dailyStudyHours]);

  // Load unavailability blocks persistently on mount
  useEffect(() => {
    loadUnavailabilityBlocks(studentId).then((blocks) => {
      setUnavailBlocks(blocks);
    });
  }, [studentId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const [activeTestSlot, setActiveTestSlot] = useState<DynamicTestSlot | null>(null);
  const [completedSlotIds, setCompletedSlotIds] = useState<string[]>(() =>
    getCompletedDynamicSlots(studentId, formatLocalDate(selectedDate))
  );

  // Sync completedSlotIds from localStorage and backend database whenever studentId or date changes
  useEffect(() => {
    const dateStr = formatLocalDate(selectedDate);
    setCompletedSlotIds(getCompletedDynamicSlots(studentId, dateStr));
    fetchCompletedDynamicSlots(studentId, dateStr).then((slots) => {
      setCompletedSlotIds(slots);
    });
  }, [studentId, selectedDate]);

  // ── Derived data ─────────────────────────────────────────────────────────

  // Full chapter map (all unlocked chapters) for slot assembly
  const chapterMap = React.useMemo(() => buildChapterMap(subjects), [subjects]);

  // Active (unlocked, not-yet-mastered) subjects for the performance panel
  const activeSubjects = React.useMemo(() => filterToActiveChapters(subjects), [subjects]);

  const slots = React.useMemo(
    () => buildSlotsFromTasks(tasks, chapterMap, unavailBlocks, subjects, selectedDate, completedSlotIds),
    [tasks, chapterMap, unavailBlocks, subjects, selectedDate, completedSlotIds]
  );

  const summary = React.useMemo((): DashboardSummary => {
    const base = buildSummary(selectedDate, tasks, capacityMinutes, subjects);

    // Enrich focus chapter with tier + reason
    if (base.todayFocusChapter) {
      const firstTask = tasks.find((t) => t.status !== 'COMPLETED' && t.status !== 'SKIPPED');
      if (firstTask) {
        const chInfo = chapterMap.get(firstTask.chapter_id);
        const mastery = chInfo?.mastery_score ?? 0;
        const tier = deriveTier(mastery);
        const reason = deriveWhyExplanation(
          tier,
          mastery,
          Boolean(firstTask.carried_forward_from_task_id),
          false
        );
        return { ...base, todayFocusTier: tier, todayFocusReason: reason };
      }
    }
    return base;
  }, [selectedDate, tasks, capacityMinutes, subjects, chapterMap]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Page heading */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-500/30 shrink-0">
            <LayoutGrid size={16} />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 font-outfit">
              Time Management Dashboard
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Your personalised schedule for today with Smart Dynamic Recall
            </p>
          </div>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition disabled:opacity-50"
          aria-label="Refresh schedule"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Error state */}
      {error && !loading && (
        <div
          className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-700/50"
          role="alert"
        >
          <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5 sm:mt-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">
              Unable to load today's study plan
            </p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{error}</p>
          </div>
          <button
            onClick={fetchData}
            className="shrink-0 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition"
          >
            Try again
          </button>
        </div>
      )}

      {/* Main content — 2-column on large screens */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

        {/* Left column — schedule */}
        <div className="lg:col-span-2 space-y-4">
          {/* Header */}
          {!loading && !error && (
            <DashboardHeader summary={summary} />
          )}
          {loading && (
            <div className="h-40 rounded-3xl bg-slate-100 dark:bg-slate-800/60 animate-pulse" />
          )}

          {/* Time grid */}
          <TimeGrid
            slots={slots}
            isLoading={loading}
            onStartDynamicTest={(slot) => setActiveTestSlot(slot)}
          />
        </div>

        {/* Right column — summary */}
        <div className="space-y-4">

          {/* Performance summary — only active (unlocked, not-yet-mastered) chapters */}
          {!loading && !error && activeSubjects.length > 0 && (
            <PerformanceSummary summary={summary} subjects={activeSubjects} />
          )}
          {loading && (
            <div className="h-56 rounded-3xl bg-slate-100 dark:bg-slate-800/60 animate-pulse" />
          )}
        </div>
      </div>

      {/* Dynamic Active Recall Test Runner Modal */}
      <DynamicRecallTestModal
        isOpen={Boolean(activeTestSlot)}
        onClose={() => setActiveTestSlot(null)}
        onComplete={(slotId) => {
          setCompletedSlotIds((prev) => [...prev, slotId]);
        }}
        slot={activeTestSlot}
        studentId={studentId}
      />
    </div>
  );
}
