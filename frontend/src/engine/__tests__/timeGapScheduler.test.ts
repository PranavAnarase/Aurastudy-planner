import {
  timeStringToMinutes,
  minutesToTimeString,
  clampInterval,
  mergeIntervals,
  extractDynamicGaps,
  generateAdaptiveTestSlots,
} from '../timeGapScheduler';

import {
  calculateTopicUrgency,
  filterEligibleTopics,
  rankTopicsByUrgency,
  assembleTestPayload,
} from '../adaptiveTopicSelector';

import type { CandidateTopic } from '../../types/scheduler';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[FAIL] ${message}`);
  }
  console.log(`[PASS] ${message}`);
}

console.log('=== Running AuraStudy Time-Gap Scheduler TypeScript Tests ===\n');

// 1. Time string conversions
assert(timeStringToMinutes('06:00 AM') === 360, '06:00 AM -> 360 mins');
assert(timeStringToMinutes('10:00 PM') === 1320, '10:00 PM -> 1320 mins');
assert(timeStringToMinutes('14:30') === 870, '14:30 (24h) -> 870 mins');
assert(minutesToTimeString(360) === '06:00 AM', '360 mins -> 06:00 AM');
assert(minutesToTimeString(1320) === '10:00 PM', '1320 mins -> 10:00 PM');

// 2. Clamping and boundary clipping
const clamped1 = clampInterval({ startMinutes: 200, endMinutes: 300 });
assert(clamped1 === null, 'Interval in sleep lockout [200, 300] clamped to null');

const clamped2 = clampInterval({ startMinutes: 300, endMinutes: 500 });
assert(
  clamped2?.startMinutes === 360 && clamped2?.endMinutes === 500,
  'Interval crossing 06:00 AM boundary [300, 500] clamped to [360, 500]'
);

// 3. Merging contiguous and overlapping intervals
const merged = mergeIntervals([
  { startMinutes: 540, endMinutes: 600, label: 'College 1' },
  { startMinutes: 600, endMinutes: 720, label: 'College 2' }, // contiguous
  { startMinutes: 700, endMinutes: 800, label: 'Tuition' },   // overlapping
]);
assert(merged.length === 1, 'Contiguous and overlapping intervals merged into 1');
assert(merged[0].startMinutes === 540 && merged[0].endMinutes === 800, 'Merged range is [540, 800]');

// 4. Regular Weekday Scheduling Scenario
// College: 09:00 - 17:00 (540 - 1020), Deep Study: 18:00 - 20:30 (1080 - 1230)
const weekdaySlots = generateAdaptiveTestSlots(
  [{ startMinutes: 540, endMinutes: 1020, label: 'College' }],
  [{ startMinutes: 1080, endMinutes: 1230, label: 'Deep Study' }]
);

assert(weekdaySlots.length === 3, 'Regular weekday emits exactly 3 dynamic test slots');
assert(weekdaySlots[0].activityType === 'FIRST_GAP_RETENTION_TEST', 'Slot 1 is Post-Sleep Recall Test');
assert(weekdaySlots[0].startMinutes === 375, 'Slot 1 starts at 06:15 AM (15m wake buffer)');
assert(weekdaySlots[0].durationMinutes === 45, 'Slot 1 duration is 45m');

assert(weekdaySlots[1].activityType === 'SPACED_REVISION_QUIZ', 'Slot 2 is Spaced Revision Quiz');
assert(weekdaySlots[1].startMinutes === 1035, 'Slot 2 is centered in 60m gap at 17:15 (1035m)');
assert(weekdaySlots[1].durationMinutes === 30, 'Slot 2 duration is 30m');

assert(weekdaySlots[2].activityType === 'SPACED_REVISION_QUIZ', 'Slot 3 is Spaced Revision Quiz');
assert(weekdaySlots[2].startMinutes === 1260, 'Slot 3 is centered in 90m gap at 21:00 (1260m)');
assert(weekdaySlots[2].durationMinutes === 30, 'Slot 3 duration is 30m');

// 5. Short Gap -> MICRO_DRILL Scenario (30 min gap)
const shortGapSlots = generateAdaptiveTestSlots(
  [
    { startMinutes: 360, endMinutes: 700, label: 'Block 1' },
    { startMinutes: 730, endMinutes: 1320, label: 'Block 2' },
  ],
  []
);
assert(shortGapSlots.length === 1, 'Short gap emits 1 dynamic slot');
assert(shortGapSlots[0].activityType === 'MICRO_DRILL', 'Short gap [700, 730] classifies as MICRO_DRILL');
assert(shortGapSlots[0].durationMinutes === 30, 'MICRO_DRILL has exact 30m duration');

// 6. Tight schedule with gaps < 20 mins discarded
const tightScheduleSlots = generateAdaptiveTestSlots(
  [
    { startMinutes: 360, endMinutes: 600 },
    { startMinutes: 615, endMinutes: 900 }, // 15m gap (< 20)
    { startMinutes: 910, endMinutes: 1320 }, // 10m gap (< 20)
  ],
  []
);
assert(tightScheduleSlots.length === 0, 'Gaps under 20 mins are correctly discarded as buffers');

// 7. Retention Urgency and Topic Eligibility
const topics: CandidateTopic[] = [
  {
    chapterId: 101,
    chapterName: 'Thermodynamics',
    subjectName: 'Physics',
    masteryScore: 45,
    daysSinceReview: 4,
    wasStudiedYesterday: true,
    isUnlocked: true,
    isCompletedOrInProgress: true,
  },
  {
    chapterId: 102,
    chapterName: 'Electromagnetism',
    subjectName: 'Physics',
    masteryScore: 88,
    daysSinceReview: 2,
    wasStudiedYesterday: false,
    isUnlocked: true,
    isCompletedOrInProgress: true,
  },
  {
    chapterId: 103,
    chapterName: 'Locked Quantum Mechanics',
    subjectName: 'Physics',
    masteryScore: 0,
    isUnlocked: false,
    isCompletedOrInProgress: false,
  },
];

const eligible = filterEligibleTopics(topics);
assert(eligible.length === 2, 'Locked/unstudied topics are filtered out');

const ranked = rankTopicsByUrgency(topics);
assert(ranked[0].chapterId === 101, 'Thermodynamics (studied yesterday + low mastery) ranks highest');

const payload = assembleTestPayload(weekdaySlots[0], topics);
assert(payload.topics.length > 0, 'Test payload assembled successfully with ranked candidate topics');

console.log('\n=== ALL TYPESCRIPT ENGINE TESTS PASSED CLEANLY! ===');
