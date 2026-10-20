import { useState, useEffect, useRef, useMemo } from 'react';
import { API_BASE_URL, AURASTUDY_V1_PREFIX } from '../config/api';
import { Calendar, CheckCircle2, Lightbulb, TrendingUp, BarChart2, BookOpen, Clock, Star, Compass, Award, Zap, Sparkles, Lock, LayoutGrid, ShieldAlert, AlertCircle, Brain, Play, ArrowRight, Target } from 'lucide-react';
import ChapterAssessmentModal from './ChapterAssessmentModal';
import ChapterLearningHubModal from './ChapterLearningHubModal';
import StudentAnalyticsDashboard from './StudentAnalyticsDashboard';
import TimeManagementDashboard from './TimeManagementDashboard';
import DynamicRecallTestModal from './dashboard/DynamicRecallTestModal';
import {
  loadUnavailabilityBlocks,
  filterBlocksForDate,
  format24hTo12hDisplay,
} from './dashboard/UnavailabilityManager';
import {
  generateAdaptiveTestSlots,
  timeStringToMinutes,
} from '../engine/timeGapScheduler';
import {
  rankTopicsByUrgency,
} from '../engine/adaptiveTopicSelector';
import {
  getCompletedDynamicSlots,
  fetchCompletedDynamicSlots,
  markDynamicSlotCompleted,
} from '../utils/completedTests';
import type { UnavailabilityBlock, DynamicTestSlot } from '../types/dashboard';
import type { CandidateTopic } from '../types/scheduler';


interface Task {
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
}

interface DayPlan {
  day_number: number;
  date?: string;
  formatted_date?: string;
  is_today?: boolean;
  allocated_minutes: number;
  capacity_minutes: number;
  tasks: Array<{
    chapter_id: number;
    chapter_name: string;
    subject_name: string;
    cost: number;
    current_stage?: string;
    concept_completed?: boolean;
    practice_completed?: boolean;
    recall_completed?: boolean;
    assessment_unlocked?: boolean;
  }>;
}



interface GapSuggestion {
  category: string;
  accuracy: number;
  suggestion: string;
}

interface DashboardProps {
  studentId: number;
  sessionId: number;
  profileVersion: number;
  studentName?: string;
  attemptedSubjects?: string[];
  onResumeDiagnostic?: () => void;
}


// Helper: parse "hh:mm AM/PM" into a Date object for today (for time comparison)
function parseTimeToToday(timeStr: string | undefined): Date | null {
  if (!timeStr) return null;
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && hours !== 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d;
}

const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function getSubjectBadgeColor(subjectName: string): string {
  const lower = (subjectName || '').toLowerCase();
  if (lower.includes('math')) {
    return 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/50';
  } else if (lower.includes('science') || lower.includes('environmental studies part 1')) {
    return 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800/50';
  } else if (lower.includes('history') || lower.includes('civics') || lower.includes('environmental studies part 2')) {
    return 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/50';
  } else if (lower.includes('geography')) {
    return 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/50';
  } else if (lower.includes('english')) {
    return 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/50';
  } else if (lower.includes('hindi')) {
    return 'bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800/50';
  } else if (lower.includes('marathi')) {
    return 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/50';
  }
  return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';
}

function getStageLabel(stage?: string) {
  if (stage === 'PRACTICE_DRILL') return { label: '2. Practice Drill', color: 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300' };
  if (stage === 'ACTIVE_RECALL') return { label: '3. Active Recall', color: 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 border-indigo-300' };
  if (stage === 'READY_FOR_ASSESSMENT') return { label: '4. Ready to Assess', color: 'bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border-purple-300' };
  if (stage === 'COMPLETED') return { label: '✓ Mastered', color: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300' };
  return { label: '1. Concept Study', color: 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border-blue-300' };
}


// Completion confirmation state
interface CompletionFormState {
  taskId: number;
  chapterName: string;
  subjectName: string;
  startTime?: string;
  endTime?: string;
  rating: number;      // 0 = unset, 1-5 stars
  notes: string;
}

export default function Dashboard({ studentId, sessionId, profileVersion, studentName, attemptedSubjects = [], onResumeDiagnostic }: DashboardProps) {
  const initiatedRef = useRef(false);
  const [activeTab, setActiveTab] = useState<'daily' | 'weekly' | 'gap' | 'assessment' | 'analytics' | 'timetable'>('daily');

  const [dailyTasks, setDailyTasks] = useState<Task[]>([]);
  const [weeklyPlan, setWeeklyPlan] = useState<DayPlan[]>([]);
  const [dailyCapacityMinutes, setDailyCapacityMinutes] = useState<number>(180);
  const [gapSuggestions, setGapSuggestions] = useState<GapSuggestion[]>([]);
  const [loading, setLoading] = useState(true);

  // Multi-Stage Chapter Learning Hub State
  const [activeLearningHubChapter, setActiveLearningHubChapter] = useState<{
    chapterId: number;
    chapterName: string;
    subjectName: string;
  } | null>(null);

  // Assessment & Spaced Review State
  const [activeAssessmentChapter, setActiveAssessmentChapter] = useState<{
    chapterId: number;
    chapterName: string;
    subjectName: string;
    isSpacedReview?: boolean;
  } | null>(null);
  const [availableSubjects, setAvailableSubjects] = useState<any[]>([]);
  const [dueReviews, setDueReviews] = useState<any[]>([]);
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>('ALL');
  const [showAllChapters, setShowAllChapters] = useState(false);



  // Unavailability blocks / user commitments
  const [unavailBlocks, setUnavailBlocks] = useState<UnavailabilityBlock[]>([]);

  // Completion confirmation form
  const [completionForm, setCompletionForm] = useState<CompletionFormState | null>(null);

  // Dynamic Active Recall Test Modal State
  const [activeDynamicTestSlot, setActiveDynamicTestSlot] = useState<DynamicTestSlot | null>(null);

  // Current time (refreshed every second for live clock)
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // Completed dynamic slots state (synced with localStorage & database backend)
  const [completedDynamicSlotIds, setCompletedDynamicSlotIds] = useState<string[]>(() =>
    getCompletedDynamicSlots(studentId, todayStr)
  );

  useEffect(() => {
    // 1. Instantly read local cache
    setCompletedDynamicSlotIds(getCompletedDynamicSlots(studentId, todayStr));
    // 2. Fetch from database to ensure persistent state across logins/devices
    fetchCompletedDynamicSlots(studentId, todayStr).then((slots) => {
      setCompletedDynamicSlotIds(slots);
    });
  }, [studentId, todayStr]);

  // High-Five state and real-time sync with Parent Portal
  const [highFives, setHighFives] = useState<Array<{ id: string; sender_name: string; message: string; timestamp?: number }>>([]);
  const [highFiveCelebration, setHighFiveCelebration] = useState(false);

  useEffect(() => {
    if (!studentId) return;

    const checkHighFives = async () => {
      try {
        // 1. Fetch from API
        const res = await fetch(`${AURASTUDY_V1_PREFIX}/parent/high-fives?user_id=${encodeURIComponent(String(studentId))}`);
        if (res.ok) {
          const items = await res.json();
          if (items && items.length > 0) {
            setHighFives(items);
            return;
          }
        }
      } catch (e) {}

      // 2. Check LocalStorage for instant cross-tab sync
      const latest = localStorage.getItem('aura_latest_high_five');
      if (latest) {
        try {
          const parsed = JSON.parse(latest);
          const ackKey = `aura_ack_hf_${parsed.id || parsed.timestamp}`;
          if (!localStorage.getItem(ackKey)) {
            setHighFives([parsed]);
          }
        } catch (e) {}
      }
    };

    checkHighFives();
    const interval = setInterval(checkHighFives, 8000);
    window.addEventListener('storage', checkHighFives);
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', checkHighFives);
    };
  }, [studentId]);

  const handleAckHighFive = async (hfId: string) => {
    setHighFiveCelebration(true);
    try {
      await fetch(`${AURASTUDY_V1_PREFIX}/parent/ack-high-five/${hfId}`, { method: 'POST' });
    } catch (e) {}
    localStorage.setItem(`aura_ack_hf_${hfId}`, 'true');
    setHighFives((prev) => prev.filter((h) => h.id !== hfId));
    setTimeout(() => setHighFiveCelebration(false), 4000);
  };

  // Filter commitments that apply to today
  const todayCommitments = useMemo(() => {
    return filterBlocksForDate(unavailBlocks, now).sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [unavailBlocks, now]);

  // Compute Smart Dynamic Active Recall & Micro-Drill test slots from free daily time gaps
  const dynamicRecallSlots = useMemo((): DynamicTestSlot[] => {
    const commitmentIntervals = todayCommitments
      .map((c) => ({
        startMinutes: timeStringToMinutes(c.startTime),
        endMinutes: timeStringToMinutes(c.endTime),
        label: c.label,
      }))
      .filter((c) => c.endMinutes > c.startMinutes);

    const plannedStudyIntervals = dailyTasks
      .filter((t) => t.start_time && t.end_time)
      .map((t) => ({
        startMinutes: timeStringToMinutes(t.start_time!),
        endMinutes: timeStringToMinutes(t.end_time!),
        label: t.chapter_name,
      }));

    const completedTaskChapterIds = new Set(
      dailyTasks.filter((t) => t.status === 'COMPLETED').map((t) => t.chapter_id)
    );

    const candidates: CandidateTopic[] = [];
    for (const subj of availableSubjects) {
      for (const ch of subj.chapters || []) {
        if (ch.is_locked === true) continue;
        const isStudiedYesterday = completedTaskChapterIds.has(ch.chapter_id);
        const isCompletedOrInProgress = (ch.mastery_score || 0) > 0 || isStudiedYesterday || Boolean(ch.is_due);

        candidates.push({
          chapterId: ch.chapter_id,
          chapterName: ch.chapter_name,
          subjectName: subj.subject_name,
          masteryScore: ch.mastery_score ?? 0,
          lastReviewedDate: ch.next_review_date ?? undefined,
          daysSinceReview: ch.interval_days ?? 1,
          stabilityFactor: 2.0,
          wasStudiedYesterday: isStudiedYesterday,
          isUnlocked: ch.is_unlocked !== false,
          isCompletedOrInProgress,
        });
      }
    }

    const rankedTopics = rankTopicsByUrgency(candidates);
    const rawSlots = generateAdaptiveTestSlots(commitmentIntervals, plannedStudyIntervals);

    return rawSlots
      .filter((dyn) => !completedDynamicSlotIds.includes(dyn.id))
      .map((dyn) => {
        const targetTopics = rankedTopics.slice(0, 3).map((t) => ({
          chapterId: t.chapterId,
          chapterName: t.chapterName,
          subjectName: t.subjectName,
          masteryScore: t.masteryScore,
        }));

        return {
          id: dyn.id,
          kind: 'dynamic_test' as const,
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
        };
      });
  }, [todayCommitments, dailyTasks, availableSubjects, completedDynamicSlotIds]);

  const fetchCommitments = async () => {
    try {
      const blocks = await loadUnavailabilityBlocks(studentId);
      setUnavailBlocks(blocks);
    } catch (err) {
      console.warn('Failed to load commitments in dashboard:', err);
    }
  };

  const fetchDailyPlan = async (strat: 'knapsack' | 'greedy' = 'knapsack', forceRegen: boolean = false) => {
    try {
      const response = await fetch(`${AURASTUDY_V1_PREFIX}/planner/daily`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          plan_date: todayStr,
          strategy: strat,
          force_regenerate: forceRegen
        }),
      });
      if (!response.ok) throw new Error('Failed to load daily plan.');
      const data = await response.json();
      setDailyTasks(data.tasks);
      if (data.capacity_minutes) setDailyCapacityMinutes(data.capacity_minutes);
    } catch (err: any) {
      console.error(err.message || 'Connection error.');
    }
  };


  const fetchWeeklyPlan = async () => {
    try {
      const response = await fetch(`${AURASTUDY_V1_PREFIX}/planner/weekly`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId }),
      });
      if (!response.ok) throw new Error('Failed to load weekly plan.');
      const data = await response.json();
      setWeeklyPlan(data.days);
      if (data.days && data.days.length > 0 && data.days[0].capacity_minutes) {
        setDailyCapacityMinutes(data.days[0].capacity_minutes);
      }
    } catch (err: any) {
      console.error(err.message || 'Connection error.');
    }
  };


  const fetchGapAnalysis = async () => {
    try {
      const response = await fetch(`${AURASTUDY_V1_PREFIX}/diagnostic/gap-analysis?session_id=${encodeURIComponent(String(sessionId))}`);
      if (!response.ok) throw new Error('No gap analysis available yet.');
      const data = await response.json();
      setGapSuggestions(data.suggestions);
    } catch (err: any) {
      // Opt-in analysis might not be initialized
      setGapSuggestions([]);
    }
  };

  const fetchAvailableChapters = async () => {
    try {
      const response = await fetch(`${AURASTUDY_V1_PREFIX}/assessment/chapters/available?user_id=${encodeURIComponent(String(studentId))}`);
      if (response.ok) {
        const data = await response.json();
        setAvailableSubjects(data.subjects || []);
      }
    } catch (err) {
      setAvailableSubjects([]);
    }
  };

  const fetchDueReviews = async () => {
    try {
      const response = await fetch(`${AURASTUDY_V1_PREFIX}/assessment/spaced-reviews/due?user_id=${encodeURIComponent(String(studentId))}`);
      if (response.ok) {
        const data = await response.json();
        setDueReviews(data.reviews || []);
      }
    } catch (err) {
      setDueReviews([]);
    }
  };

  useEffect(() => {
    if (initiatedRef.current) return;
    initiatedRef.current = true;

    const initDashboard = async () => {
      setLoading(true);
      await Promise.all([
        fetchDailyPlan(),
        fetchWeeklyPlan(),
        fetchGapAnalysis(),
        fetchAvailableChapters(),
        fetchDueReviews(),
        fetchCommitments()
      ]);
      setLoading(false);
    };
    initDashboard();
  }, [studentId, sessionId]);

  useEffect(() => {
    // Dynamically re-pack planner whenever profileVersion is updated
    if (profileVersion > 0) {
      const reloadDashboardPlans = async () => {
        setLoading(true);
        await Promise.all([
          fetchDailyPlan('knapsack', true), // Force regeneration on hours/settings edits!
          fetchWeeklyPlan(),
          fetchCommitments()
        ]);
        setLoading(false);
      };
      reloadDashboardPlans();
    }
  }, [profileVersion]);

  const handleStatusChange = async (taskId: number, newStatus: string) => {
    try {
      const response = await fetch(`${AURASTUDY_V1_PREFIX}/planner/daily/task/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!response.ok) throw new Error('Failed to update task.');

      // Update locally
      setDailyTasks((prev) =>
        prev.map((t) => (t.task_id === taskId ? { ...t, status: newStatus } : t))
      );

      // Trigger cross-tab sync for parent dashboard
      localStorage.setItem('aura_last_task_update', Date.now().toString());

      // Re-trigger weekly re-pack locally
      fetchWeeklyPlan();
    } catch (err: any) {
      alert(err.message || 'Status update failed.');
    }
  };

  // Open completion confirmation overlay
  const openCompletionForm = (task: Task) => {
    setCompletionForm({
      taskId: task.task_id,
      chapterName: task.chapter_name,
      subjectName: task.subject_name,
      startTime: task.start_time,
      endTime: task.end_time,
      rating: 0,
      notes: '',
    });
  };

  // Confirm completion from overlay
  const confirmCompletion = () => {
    if (!completionForm) return;
    // Log optional data (can be persisted via API later)
    if (completionForm.rating > 0 || completionForm.notes.trim()) {
      console.log('[AuraStudy] Completion feedback:', {
        task_id: completionForm.taskId,
        difficulty_rating: completionForm.rating,
        notes: completionForm.notes,
      });
    }
    handleStatusChange(completionForm.taskId, 'COMPLETED');
    setCompletionForm(null);
  };

  // Determine active/overdue status for each task
  const getTaskTimeStatus = (task: Task): 'active' | 'overdue' | 'upcoming' | 'none' => {
    if (task.status === 'COMPLETED' || task.status === 'SKIPPED') return 'none';
    const startDt = parseTimeToToday(task.start_time);
    const endDt = parseTimeToToday(task.end_time);
    if (!startDt || !endDt) return 'none';
    if (now >= startDt && now < endDt) return 'active';
    if (now >= endDt && (task.status === 'PENDING' || task.status === 'IN_PROGRESS')) return 'overdue';
    return 'upcoming';
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        <p className="text-slate-400 font-light">Loading study workspace...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-10 px-4 space-y-10">
      {/* Upper overview header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-3xl font-extrabold font-outfit tracking-tight text-slate-900 dark:text-slate-100">
            Welcome Back, {studentName || 'Scholar'}!
          </h1>

          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Standard 7 • Academic year dashboard
          </p>
        </div>

        {/* Dashboard-Wide Persistent Live Clock Card */}
        <div className="flex items-center gap-3 bg-white/90 dark:bg-slate-900/70 glass-dark px-4 py-2.5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm dark:shadow-none shrink-0">
          <div className="p-2.5 rounded-xl bg-violet-500/10 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400 border border-violet-200/60 dark:border-violet-500/30 shrink-0">
            <Clock size={18} className="animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-black text-sm tracking-tight text-slate-900 dark:text-slate-100">
                {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
              </span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span> Live
              </span>
            </div>
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
              <Calendar size={11} className="text-indigo-500 dark:text-indigo-400" />
              {now.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>
        </div>
      </div>


      {/* Top-Level Primary Navigation Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-1.5 rounded-2xl bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 backdrop-blur-md shadow-sm">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white/60 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800/60">
          <button
            onClick={() => setActiveTab('daily')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab !== 'analytics' && activeTab !== 'timetable'
                ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Calendar size={14} />
            <span>Study Workspace</span>
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'analytics'
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <TrendingUp size={14} />
            <span>Performance Analytics & Insights</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-black uppercase ${
              activeTab === 'analytics' 
                ? 'bg-white/20 text-white' 
                : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20'
            }`}>
              Live
            </span>
          </button>

          <button
            onClick={() => setActiveTab('timetable')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'timetable'
                ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <LayoutGrid size={14} />
            <span>Time Management</span>
          </button>
        </div>
      </div>

      {/* FULL-WIDTH VIEW: Time Management Dashboard */}
      {activeTab === 'timetable' ? (
        <div className="space-y-6 animate-fadeIn">
          <TimeManagementDashboard studentId={studentId} />
        </div>
      ) : activeTab === 'analytics' ? (
        <div className="space-y-6 animate-fadeIn">
          <StudentAnalyticsDashboard
            studentId={studentId}
            onTakeAssessment={(cid) => {
              setActiveAssessmentChapter({
                chapterId: cid,
                chapterName: 'Chapter Assessment',
                subjectName: 'Academic Subject'
              });
            }}
          />
        </div>
      ) : (
        /* STUDY WORKSPACE LAYOUT (Full-width balanced or with sidebar if needed) */
        (() => {
          const hasSidebar = attemptedSubjects.length < 7 && Boolean(onResumeDiagnostic);
          return (
            <div className={hasSidebar ? "grid grid-cols-1 lg:grid-cols-3 gap-8 items-start" : "space-y-8 max-w-5xl mx-auto w-full"}>
              {/* Main Workspace Column */}
              <div className={hasSidebar ? "lg:col-span-2 space-y-8" : "space-y-8 w-full"}>
        {/* PARENT HIGH-FIVE BANNER */}
        {highFives.length > 0 && (
          <div className="p-5 rounded-3xl bg-gradient-to-r from-pink-500/15 via-purple-500/15 to-indigo-500/15 border-2 border-pink-500/40 shadow-xl backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-pink-500 via-rose-500 to-purple-600 flex items-center justify-center text-2xl shadow-lg shadow-pink-500/30 flex-shrink-0 animate-bounce">
                👏
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 font-outfit">
                    High-Five from {highFives[0].sender_name}!
                  </h4>
                  <span className="text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full bg-pink-100 dark:bg-pink-900/60 text-pink-700 dark:text-pink-300 border border-pink-200 dark:border-pink-800">
                    Parent Love ❤️
                  </span>
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5 font-medium">
                  "{highFives[0].message}"
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={() => handleAckHighFive(highFives[0].id)}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-pink-600/30 transition hover:scale-105 active:scale-95"
              >
                <span>High-Five Back! ✋</span>
              </button>
              <button
                type="button"
                onClick={() => handleAckHighFive(highFives[0].id)}
                className="px-3 py-2 rounded-xl bg-white/80 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs border border-slate-200 dark:border-slate-700 transition"
              >
                Thank You ❤️
              </button>
            </div>
          </div>
        )}

        {/* High Five Celebration Toast */}
        {highFiveCelebration && (
          <div className="p-4 rounded-2xl bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xl animate-bounce">
            <Sparkles size={16} /> High-Five Sent Back to Your Parents! Keep shining on your study plan! 🌟
          </div>
        )}

        {/* Workspace Sub-Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 space-x-6 text-sm font-medium overflow-x-auto">
          <button
            onClick={() => setActiveTab('daily')}
            className={`pb-4 transition relative whitespace-nowrap ${
              activeTab === 'daily' ? 'text-violet-600 dark:text-violet-400 border-b-2 border-violet-500 font-bold' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            Daily Study Plan
          </button>
          <button
            onClick={() => setActiveTab('weekly')}
            className={`pb-4 transition relative whitespace-nowrap ${
              activeTab === 'weekly' ? 'text-violet-600 dark:text-violet-400 border-b-2 border-violet-500 font-bold' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            Weekly Schedule
          </button>
          <button
            onClick={() => setActiveTab('assessment')}
            className={`pb-4 transition relative whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'assessment' ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500 font-bold' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Award size={15} /> Chapter Assessments
            {dueReviews.length > 0 && (
              <span className="px-1.5 py-0.2 text-[10px] font-black rounded-full bg-amber-500 text-slate-950 animate-pulse">
                {dueReviews.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('gap')}
            className={`pb-4 transition relative whitespace-nowrap ${
              activeTab === 'gap' ? 'text-violet-600 dark:text-violet-400 border-b-2 border-violet-500 font-bold' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            Gap Analysis
          </button>
        </div>



      {/* Tab Contents */}
      {activeTab === 'daily' && (
        <div className="space-y-6">
          {/* Today's Contextual Schedule Header */}
          <div className="p-6 rounded-3xl bg-gradient-to-br from-indigo-50/90 via-white to-purple-50/60 dark:from-indigo-950/40 dark:via-slate-900 dark:to-slate-900/90 border border-indigo-200/80 dark:border-indigo-500/20 shadow-sm dark:shadow-none flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-violet-600 text-white shadow-sm">
                  TODAY
                </span>
                <h2 className="text-xl font-bold font-outfit text-slate-900 dark:text-slate-100">
                  Today's Schedule — {now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </h2>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {dailyTasks.length} planned study session{dailyTasks.length !== 1 ? 's' : ''}
                {todayCommitments.length > 0 ? ` • ${todayCommitments.length} personal commitment${todayCommitments.length !== 1 ? 's' : ''} (unavailable)` : ''} aligned with your weekly adaptive timetable.
              </p>
            </div>

            {/* Daily Stats Badge */}
            <div className="flex items-center gap-2">
              <div className="bg-white/80 dark:bg-slate-800/80 px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none text-xs font-semibold">
                <span className="text-slate-500 dark:text-slate-400">Today's Study Budget: </span>
                <strong className="text-slate-900 dark:text-slate-100 font-bold font-mono">
                  {dailyTasks.reduce((acc, t) => acc + (t.allocated_minutes || 0), 0)}m
                </strong>
                <span className="text-slate-400 dark:text-slate-500 font-mono"> / {dailyCapacityMinutes}m</span>
              </div>
            </div>

          </div>

          {/* Today's User Commitments (Unavailable Periods) in Daily Planner */}
          {todayCommitments.length > 0 && (
            <div className="p-5 rounded-3xl bg-slate-50/80 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/80">
                    <Clock size={15} />
                  </div>
                  <h3 className="text-sm font-bold font-outfit text-slate-900 dark:text-slate-100">
                    Today's Commitments & Unavailable Slots ({todayCommitments.length})
                  </h3>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  Protected Times
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {todayCommitments.map((comm) => {
                  const recurrence = comm.recurrenceType || 'WEEKLY_RECURRING';
                  const days = comm.daysOfWeek || [];
                  let recurrenceLabel = '🔁 Today';
                  if (recurrence === 'SPECIFIC_DATE' && comm.specificDate) {
                    recurrenceLabel = `📅 ${comm.specificDate}`;
                  } else if (days.length === 5) {
                    recurrenceLabel = '🔁 Mon–Fri (Weekdays)';
                  } else if (days.length === 2) {
                    recurrenceLabel = '🔁 Sat–Sun (Weekends)';
                  } else if (days.length === 7) {
                    recurrenceLabel = '🔁 Every Day';
                  }

                  return (
                    <div
                      key={comm.id}
                      className="p-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 shadow-xs flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        {/* Time slot badge */}
                        <div className="flex-shrink-0 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-2 text-center min-w-[85px]">
                          <div className="flex items-center justify-center gap-1 mb-0.5">
                            <Clock size={10} className="text-indigo-500 dark:text-indigo-400" />
                          </div>
                          <span className="block text-[11px] font-bold text-slate-800 dark:text-slate-200 font-mono">
                            {format24hTo12hDisplay(comm.startTime)}
                          </span>
                          <span className="block text-[8px] text-slate-400 dark:text-slate-500 my-0.2">to</span>
                          <span className="block text-[11px] font-bold text-slate-800 dark:text-slate-200 font-mono">
                            {format24hTo12hDisplay(comm.endTime)}
                          </span>
                        </div>

                        {/* Commitment info */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50">
                              {comm.label}
                            </span>
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
                              {recurrenceLabel}
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                            <Lock size={11} className="text-slate-400" /> Unavailable for study
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                          Blocked Slot
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Smart Dynamic Active Recall & Micro-Drills Section */}
          {dynamicRecallSlots.length > 0 && (
            <div className="p-5 rounded-3xl bg-gradient-to-r from-blue-50/70 via-indigo-50/50 to-purple-50/70 dark:from-indigo-950/40 dark:via-slate-900 dark:to-purple-950/30 border border-indigo-200/80 dark:border-indigo-500/20 space-y-3 shadow-sm dark:shadow-none animate-in fade-in">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-600 text-white shadow-sm">
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold font-outfit text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      Smart Dynamic Active Recall & Micro-Drills
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                        {dynamicRecallSlots.length} Ready
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Auto-scheduled in your free daily time gaps to lock in long-term memory retention.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {dynamicRecallSlots.map((slot) => {
                  const isPostSleep = slot.activityType === 'FIRST_GAP_RETENTION_TEST';
                  const isMicroDrill = slot.activityType === 'MICRO_DRILL';

                  return (
                    <div
                      key={slot.id}
                      className={`p-4 rounded-2xl border transition flex flex-col justify-between space-y-3 shadow-xs hover:shadow-md ${
                        isPostSleep
                          ? 'bg-gradient-to-br from-emerald-50/80 to-teal-50/40 dark:from-emerald-950/30 dark:to-slate-900 border-emerald-200 dark:border-emerald-800/60 hover:border-emerald-400'
                          : isMicroDrill
                          ? 'bg-gradient-to-br from-indigo-50/80 to-blue-50/40 dark:from-indigo-950/30 dark:to-slate-900 border-indigo-200 dark:border-indigo-800/60 hover:border-indigo-400'
                          : 'bg-gradient-to-br from-purple-50/80 to-pink-50/40 dark:from-purple-950/30 dark:to-slate-900 border-purple-200 dark:border-purple-800/60 hover:border-purple-400'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-1">
                          <span className={`text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded-md border ${
                            isPostSleep
                              ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                              : isMicroDrill
                              ? 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700'
                              : 'bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-300 border-purple-300 dark:border-purple-700'
                          }`}>
                            {slot.startTime} – {slot.endTime}
                          </span>
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1">
                            <Zap size={10} className="text-amber-500" />
                            {slot.badgeLabel}
                          </span>
                        </div>

                        <div>
                          <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                            {slot.title}
                          </h4>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">
                            {slot.subtitle}
                          </p>
                        </div>

                        {slot.targetTopics && slot.targetTopics.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap pt-1">
                            {slot.targetTopics.map((top) => (
                              <span
                                key={top.chapterId}
                                className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                              >
                                {top.subjectName}: {top.chapterName}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                          {slot.questionCount} Qs • {slot.durationMinutes}m
                        </span>
                        <button
                          onClick={() => setActiveDynamicTestSlot(slot)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 shadow-sm transition ${
                            isPostSleep
                              ? 'bg-emerald-600 hover:bg-emerald-500'
                              : isMicroDrill
                              ? 'bg-indigo-600 hover:bg-indigo-500'
                              : 'bg-purple-600 hover:bg-purple-500'
                          }`}
                        >
                          <Play size={11} className="fill-current" />
                          Start Drill
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Goal Completion Celebration Card */}
          {dailyTasks.length > 0 && dailyTasks.every(t => t.status === 'COMPLETED') && (
            <div className="p-6 rounded-3xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-indigo-500/10 border border-emerald-300 dark:border-emerald-500/30 text-center space-y-2 shadow-sm animate-in fade-in">
              <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto shadow-md">
                <CheckCircle2 size={28} />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-outfit">
                🎉 All Today's Study Tasks Completed!
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                You have met your {dailyCapacityMinutes}m study goal for today. Next syllabus chapters are scheduled for tomorrow in your Weekly Timetable!
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4">
            {dailyTasks.length === 0 ? (
              <div className="text-center py-12 text-slate-500 bg-slate-100/50 dark:bg-slate-900/20 border border-slate-200 dark:border-slate-800 rounded-3xl">
                No tasks generated for today. Hit daily study goal limits?
              </div>

            ) : (
              dailyTasks.map((task) => {
                const isDone = task.status === 'COMPLETED';
                const isInProgress = task.status === 'IN_PROGRESS';
                const timeStatus = getTaskTimeStatus(task);

                return (
                  <div
                    key={task.task_id}
                    className={`bg-white dark:bg-slate-900/60 glass-dark rounded-2xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition border border-slate-200/80 dark:border-slate-800/60 hover:border-indigo-400/50 shadow-sm dark:shadow-none ${
                      timeStatus === 'active' ? 'task-active scale-[1.01]' : ''
                    } ${timeStatus === 'overdue' ? 'task-overdue' : ''}`}
                  >
                    {/* Left: Time badge + task info */}
                    <div className="flex items-start gap-4">
                      {/* Time slot badge */}
                      {task.start_time && task.end_time && (
                        <div className="flex-shrink-0 bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800/50 rounded-xl px-3 py-2.5 text-center min-w-[90px]">
                          <div className="flex items-center justify-center gap-1 mb-0.5">
                            <Clock size={10} className="text-violet-500 dark:text-violet-400" />
                          </div>
                          <span className="block text-xs font-bold text-violet-700 dark:text-violet-300 font-mono">
                            {task.start_time}
                          </span>
                          <span className="block text-[9px] text-slate-400 dark:text-slate-500 my-0.5">to</span>
                          <span className="block text-xs font-bold text-violet-700 dark:text-violet-300 font-mono">
                            {task.end_time}
                          </span>
                        </div>
                      )}

                      {/* Task details */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md border ${getSubjectBadgeColor(task.subject_name)}`}>
                            {task.subject_name}
                          </span>
                          {(() => {
                            const stageBadge = getStageLabel(task.current_stage);
                            return (
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${stageBadge.color}`}>
                                {stageBadge.label}
                              </span>
                            );
                          })()}
                          {timeStatus === 'active' && (
                            <span className="text-[10px] uppercase font-extrabold tracking-wider text-white bg-violet-600 dark:bg-violet-500 px-2 py-0.5 rounded animate-pulse">
                              NOW
                            </span>
                          )}
                          {timeStatus === 'overdue' && (
                            <span className="text-[10px] uppercase font-extrabold tracking-wider text-amber-800 dark:text-amber-200 bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 rounded">
                              Overdue
                            </span>
                          )}
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-200 font-outfit">{task.chapter_name}</h3>
                        <p className="text-xs text-slate-500 flex items-center gap-1">
                          <Clock size={12} /> Study allocation: {task.allocated_minutes} minutes
                        </p>
                      </div>
                    </div>

                    {/* Right: Status buttons & Learning Hub / Assessment button */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => setActiveLearningHubChapter({
                          chapterId: task.chapter_id,
                          chapterName: task.chapter_name,
                          subjectName: task.subject_name
                        })}
                        className="px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/60 dark:to-purple-950/40 border border-indigo-200 dark:border-indigo-500/40 text-indigo-700 dark:text-indigo-300 hover:border-indigo-400 transition shadow-xs"
                        title="Open 4-Stage Learning Pipeline (Concept -> Practice -> Recall -> Assess)"
                      >
                        <BookOpen size={14} className="text-indigo-500" /> Study & Practice
                      </button>
                      <button
                        onClick={() => setActiveAssessmentChapter({
                          chapterId: task.chapter_id,
                          chapterName: task.chapter_name,
                          subjectName: task.subject_name
                        })}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-sm ${
                          task.assessment_unlocked || task.current_stage === 'READY_FOR_ASSESSMENT' || task.current_stage === 'COMPLETED'
                            ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700'
                        }`}
                        title={task.assessment_unlocked ? 'Take Chapter Internal Assessment' : 'Complete Concept, Practice, and Recall to unlock'}
                      >
                        {task.assessment_unlocked || task.current_stage === 'READY_FOR_ASSESSMENT' || task.current_stage === 'COMPLETED' ? <Award size={14} /> : <Lock size={14} />}
                        Assess Chapter
                      </button>

                      <button
                        onClick={() => openCompletionForm(task)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
                          isDone
                            ? 'bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-500 text-green-700 dark:text-green-300'
                            : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <CheckCircle2 size={14} /> Completed
                      </button>
                      <button
                        onClick={() => handleStatusChange(task.task_id, 'IN_PROGRESS')}
                        className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
                          isInProgress
                            ? 'bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-500 text-blue-700 dark:text-blue-300'
                            : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <TrendingUp size={14} /> In Progress
                      </button>
                    </div>
                  </div>
                );
              })
            )}

            {/* Free Revision / Rest Slot for remaining budget */}
            {(() => {
              const allocated = dailyTasks.reduce((acc, t) => acc + (t.allocated_minutes || 0), 0);
              const remaining = Math.max(0, dailyCapacityMinutes - allocated);
              if (remaining > 0) {
                return (
                  <div className="p-4 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-white/40 dark:bg-slate-900/20 text-center space-y-1">
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                      + {remaining}m Free Revision / Rest Slot
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">
                      Matches today's planned weekly timetable capacity.
                    </p>
                  </div>
                );
              }
              return null;
            })()}

          </div>
        </div>
      )}


      {/* Chapter Assessments Tab */}
      {activeTab === 'assessment' && (
        <div className="space-y-6">
          {/* Top Info Banner */}
          <div className="p-6 rounded-3xl bg-gradient-to-br from-indigo-50/90 via-white to-indigo-50/50 dark:from-indigo-950/40 dark:via-slate-900 dark:to-slate-900/80 border border-indigo-200/80 dark:border-indigo-500/20 shadow-sm dark:shadow-none flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                <Award size={20} />
                <h3 className="text-lg font-bold font-outfit text-slate-900 dark:text-slate-100">Standard 7 Internal Chapter Assessments</h3>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 max-w-xl leading-relaxed">
                Take chapter assessments strictly from the Standard 7 Academic Question Bank. Completing an assessment updates your 40/60 EMA mastery score and dynamically rebalances your weekly study schedule.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-400 bg-white dark:bg-slate-800/80 px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none">
                40% Easy • 40% Avg • 20% Diff
              </span>
            </div>
          </div>

          {/* Due Spaced Retention Reviews Alert */}
          {dueReviews.length > 0 && (
            <div className="p-5 rounded-2xl bg-amber-500/10 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                  <Zap size={18} />
                  <h4 className="text-sm font-bold">Due Spaced Retention Recall Quizzes ({dueReviews.length})</h4>
                </div>
                <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300 bg-amber-200/70 dark:bg-amber-500/20 px-2.5 py-0.5 rounded-full border border-amber-300 dark:border-amber-500/30">
                  5-Question Rapid Test
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {dueReviews.map((rev) => (
                  <div key={rev.chapter_id} className="p-3.5 rounded-xl bg-white dark:bg-slate-900/80 border border-amber-200 dark:border-amber-500/20 shadow-sm dark:shadow-none flex items-center justify-between gap-3">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400">{rev.subject_name}</span>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{rev.chapter_name}</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Mastery: {rev.mastery_score}% • Due: Today</p>
                    </div>
                    <button
                      onClick={() => setActiveAssessmentChapter({
                        chapterId: rev.chapter_id,
                        chapterName: rev.chapter_name,
                        subjectName: rev.subject_name,
                        isSpacedReview: true
                      })}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition flex items-center gap-1 shadow-sm shrink-0"
                    >
                      <Zap size={12} /> Take Quiz
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Progressive Gating Banner & View Toggle */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200/80 dark:border-indigo-500/20 rounded-2xl p-4 shadow-sm dark:shadow-none">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0">
                <Sparkles size={18} />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">Progressive Chapter Gating Active</h4>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  Subsequent chapter tests unlock automatically when prerequisite chapters reach <strong className="text-slate-800 dark:text-slate-300">≥ 50% (Developing or Mastered)</strong>.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 bg-slate-200/80 dark:bg-slate-900/80 p-1 rounded-xl border border-slate-300/80 dark:border-slate-800 shrink-0 self-start sm:self-auto">
              <button
                onClick={() => setShowAllChapters(false)}
                className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition ${
                  !showAllChapters ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Active Unlocked
              </button>
              <button
                onClick={() => setShowAllChapters(true)}
                className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition ${
                  showAllChapters ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Full Roadmap
              </button>
            </div>
          </div>

          {/* Subject-Wise Mastery Viewer Summary Cards */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <BarChart2 size={14} className="text-indigo-600 dark:text-indigo-400" />
                Standard 7 Subject Mastery Overview
              </h4>
              <span className="text-[10px] text-slate-400">Click subject to inspect chapters</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
              {availableSubjects.map((subj) => {
                const score = subj.subject_mastery_score ?? 0;
                const isSelected = selectedSubjectFilter === subj.subject_name;
                return (
                  <button
                    key={subj.subject_name}
                    onClick={() => setSelectedSubjectFilter(selectedSubjectFilter === subj.subject_name ? 'ALL' : subj.subject_name)}
                    className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between space-y-2 ${
                      isSelected
                        ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-400 dark:border-indigo-500 shadow-md ring-2 ring-indigo-500/20'
                        : 'bg-white/80 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <span className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded border inline-block ${getSubjectBadgeColor(subj.subject_name)}`}>
                        {subj.subject_name}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-base font-black font-outfit text-slate-900 dark:text-slate-100 font-mono">
                          {score}%
                        </span>
                        <span className="text-[9px] font-bold text-slate-400">
                          {subj.mastered_chapters_count}/{subj.total_chapters_count}
                        </span>
                      </div>
                      <div className="w-full h-1 bg-slate-100 dark:bg-slate-800 rounded-full mt-1 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            score >= 90 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                          }`}
                          style={{ width: `${score}%` }}
                        />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Subject Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setSelectedSubjectFilter('ALL')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                selectedSubjectFilter === 'ALL'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700/60 shadow-sm dark:shadow-none'
              }`}
            >
              All Subjects
            </button>
            {availableSubjects.map((subj) => (
              <button
                key={subj.subject_name}
                onClick={() => setSelectedSubjectFilter(subj.subject_name)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition whitespace-nowrap ${
                  selectedSubjectFilter === subj.subject_name
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700/60 shadow-sm dark:shadow-none'
                }`}
              >
                {subj.subject_name}
              </button>
            ))}
          </div>

          {/* Chapters Grid by Subject */}
          <div className="space-y-6">
            {availableSubjects
              .filter(s => selectedSubjectFilter === 'ALL' || s.subject_name === selectedSubjectFilter)
              .map((subj) => {
                const displayChapters = subj.chapters.filter((ch: any) => showAllChapters || ch.is_unlocked !== false);

                return (
                  <div key={subj.subject_name} className="bg-white/80 dark:bg-slate-900/60 glass-dark rounded-2xl p-5 border border-slate-200 dark:border-slate-800/60 shadow-sm dark:shadow-none space-y-4">
                    {/* Overall Subject Mastery Header Banner */}
                    <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-50 via-indigo-50/30 to-purple-50/20 dark:from-slate-800/80 dark:via-indigo-950/30 dark:to-purple-950/20 border border-indigo-100 dark:border-indigo-900/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-md border ${getSubjectBadgeColor(subj.subject_name)}`}>
                            {subj.subject_name}
                          </span>
                          <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                            Overall Subject Mastery
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-black font-outfit text-slate-900 dark:text-slate-100 font-mono">
                            {subj.subject_mastery_score ?? 0}%
                          </span>
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                            (subj.subject_mastery_score ?? 0) >= 90
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300'
                              : (subj.subject_mastery_score ?? 0) >= 50
                              ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300'
                              : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-300'
                          }`}>
                            {(subj.subject_mastery_score ?? 0) >= 90 ? 'Mastered' : (subj.subject_mastery_score ?? 0) >= 50 ? 'Developing' : 'Needs Focus'}
                          </span>
                        </div>
                      </div>

                      <div className="w-full sm:w-64 space-y-1.5 text-left sm:text-right">
                        <div className="flex justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                          <span>Curriculum Progress:</span>
                          <span className="font-mono">{subj.mastered_chapters_count ?? 0} / {subj.total_chapters_count ?? subj.chapters.length} Mastered</span>
                        </div>

                        <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              (subj.subject_mastery_score ?? 0) >= 90 ? 'bg-emerald-500' : (subj.subject_mastery_score ?? 0) >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                            }`}
                            style={{ width: `${subj.subject_mastery_score ?? 0}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500">
                          Learning Gap Deficit: {subj.learning_gap ?? (100 - (subj.subject_mastery_score ?? 0))}%
                        </p>
                      </div>
                    </div>



                    {displayChapters.length === 0 ? (
                      <p className="text-xs text-slate-400 italic py-3 text-center">No active chapters unlocked in this subject yet.</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {displayChapters.map((ch: any) => {
                          const mastery = ch.mastery_score || 0;
                          const isLocked = ch.is_locked === true || ch.is_unlocked === false;

                          return (
                            <div
                              key={ch.chapter_id}
                              className={`p-4 rounded-xl border transition flex flex-col justify-between gap-3 ${
                                isLocked
                                  ? 'bg-slate-50/70 dark:bg-slate-900/30 border-slate-200 dark:border-slate-800/60'
                                  : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 shadow-sm hover:shadow hover:border-indigo-500/40'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">Chapter {ch.chapter_number}</span>
                                  <h5 className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-0.5 line-clamp-1">
                                    {ch.chapter_name}
                                  </h5>
                                </div>

                                {isLocked ? (
                                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full border bg-slate-100 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700/60 shrink-0 flex items-center gap-1">
                                    <Lock size={10} /> Locked
                                  </span>
                                ) : (
                                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border shrink-0 ${
                                    mastery >= 75
                                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                                      : mastery >= 50
                                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                                      : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'
                                  }`}>
                                    {mastery >= 75 ? 'Mastered' : mastery >= 50 ? 'Developing' : 'Critical'}
                                  </span>
                                )}
                              </div>

                              {isLocked ? (
                                <div className="text-[11px] text-amber-800 dark:text-amber-300/90 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-500/20 rounded-lg p-2.5 flex items-start gap-2">
                                  <Lock size={13} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                                  <span>{ch.unlock_requirement || 'Prerequisite chapter test not yet passed (≥50%)'}</span>
                                </div>
                              ) : (
                                <div className="space-y-1.5">
                                  <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400">
                                    <span>Mastery: <strong className="text-slate-800 dark:text-slate-200 font-mono">{mastery}%</strong></span>
                                    <span>Interval: {ch.interval_days || 1}d</span>
                                  </div>
                                  <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full transition-all duration-300 ${
                                        mastery >= 75 ? 'bg-emerald-500' : mastery >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                                      }`}
                                      style={{ width: `${Math.max(5, mastery)}%` }}
                                    />
                                  </div>
                                </div>
                              )}

                              {isLocked ? (
                                <button
                                  disabled
                                  className="w-full mt-1 py-2 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800/80 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700/50 cursor-not-allowed flex items-center justify-center gap-1.5"
                                >
                                  <Lock size={12} /> Locked
                                </button>
                              ) : (
                                <button
                                  onClick={() => setActiveAssessmentChapter({
                                    chapterId: ch.chapter_id,
                                    chapterName: ch.chapter_name,
                                    subjectName: subj.subject_name
                                  })}
                                  className="w-full mt-1 py-2 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center gap-1.5 transition shadow-sm"
                                >
                                  <Award size={13} /> Start Assessment
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}



      {activeTab === 'weekly' && (
        <div className="space-y-6">
          {/* Weekly Timetable Overview Banner */}
          <div className="p-6 rounded-3xl bg-gradient-to-br from-indigo-50/90 via-white to-purple-50/60 dark:from-indigo-950/40 dark:via-slate-900 dark:to-slate-900/90 border border-indigo-200/80 dark:border-indigo-500/20 shadow-sm dark:shadow-none flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3.5 rounded-2xl bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-500/30 flex items-center justify-center shrink-0">
                <Calendar size={24} className="text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold font-outfit text-slate-900 dark:text-slate-100">
                  Standard 7 Weekly Adaptive Timetable
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  {weeklyPlan[0]?.formatted_date && weeklyPlan[6]?.formatted_date
                    ? `Rolling 7-Day Cycle: ${weeklyPlan[0]?.formatted_date} – ${weeklyPlan[6]?.formatted_date}`
                    : '7-Day deficiency-driven study distribution with topological prerequisite sequencing.'}
                </p>
              </div>
            </div>

            {/* Today's Load Summary Chip */}
            <div className="flex items-center gap-2 flex-wrap">
              {(() => {
                const currentDayIndex = (now.getDay() + 6) % 7 + 1; // 1=Mon, 7=Sun
                const todaySchedule = weeklyPlan.find(d => d.day_number === currentDayIndex);
                const todaySessions = todaySchedule ? todaySchedule.tasks.length : 0;
                const todayMins = todaySchedule ? todaySchedule.allocated_minutes : 0;
                return (
                  <div className="flex items-center gap-2 bg-white/90 dark:bg-slate-800/80 px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none">
                    <Zap size={16} className="text-amber-500" />
                    <div className="text-xs">
                      <span className="font-medium text-slate-500 dark:text-slate-400">Today's Load: </span>
                      <strong className="text-slate-900 dark:text-slate-100 font-bold">{todaySessions} Sessions ({todayMins}m)</strong>
                      {dueReviews.length > 0 && (
                        <span className="text-amber-600 dark:text-amber-400 ml-1.5 font-bold">• {dueReviews.length} Quizzes Due</span>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>


          {/* 7-Day Grid with Real-World Weekday Mappings & Active Highlight */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {weeklyPlan.map((day) => {
              const currentDayIndex = (now.getDay() + 6) % 7 + 1; // 1=Mon, 7=Sun
              const isToday = day.is_today !== undefined ? day.is_today : (day.day_number === currentDayIndex);
              const weekdayName = WEEKDAY_NAMES[day.day_number - 1] || `Day ${day.day_number}`;
              const capacityPercent = Math.min(100, Math.round((day.allocated_minutes / Math.max(1, day.capacity_minutes)) * 100));
              const remainingMinutes = Math.max(0, day.capacity_minutes - day.allocated_minutes);

              return (
                <div
                  key={day.day_number}
                  className={`bg-white/90 dark:bg-slate-900/60 glass-dark rounded-2xl p-5 space-y-4 transition-all duration-300 ${
                    isToday
                      ? 'border-2 border-violet-500 dark:border-violet-500 shadow-xl shadow-violet-500/10 ring-4 ring-violet-500/10 dark:ring-violet-500/20 relative z-10'
                      : 'border border-slate-200 dark:border-slate-800/60 shadow-sm dark:shadow-none hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  {/* Day Card Header with Calendar Date */}
                  <div className="space-y-2 border-b border-slate-150 dark:border-slate-800 pb-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h3 className="font-extrabold text-base font-outfit text-slate-900 dark:text-slate-100">
                            {weekdayName}
                          </h3>
                          <span className="text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                            Day {day.day_number}
                          </span>
                        </div>
                        {day.formatted_date && (
                          <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 font-mono block mt-0.5">
                            {day.formatted_date}
                          </span>
                        )}
                      </div>
                      {isToday && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-violet-600 text-white shadow-sm animate-pulse">
                          TODAY
                        </span>
                      )}
                    </div>


                    {/* Capacity Visual Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        <span>Study Budget</span>
                        <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                          {day.allocated_minutes}m / {day.capacity_minutes}m ({capacityPercent}%)
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-500 rounded-full"
                          style={{ width: `${capacityPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Task List */}
                  <div className="space-y-3">
                    {day.tasks.length === 0 ? (
                      <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400 italic">
                        Rest day / No allocated tasks
                      </div>
                    ) : (
                      day.tasks.map((task, idx) => (
                        <div
                          key={idx}
                          className="bg-white dark:bg-slate-900/90 rounded-xl p-3.5 border border-slate-200 dark:border-slate-800/60 shadow-xs space-y-2 hover:border-indigo-400/40 transition"
                        >
                          <div className="flex items-center justify-between gap-1.5 flex-wrap">
                            <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded-md border shrink-0 ${getSubjectBadgeColor(task.subject_name)}`}>
                              {task.subject_name}
                            </span>
                            {(() => {
                              const stageBadge = getStageLabel(task.current_stage);
                              return (
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${stageBadge.color}`}>
                                  {stageBadge.label}
                                </span>
                              );
                            })()}
                          </div>

                          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 line-clamp-2 leading-snug">
                            {task.chapter_name}
                          </h4>

                          <div className="pt-1 flex items-center justify-between gap-1">
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono font-semibold">
                              {task.cost} mins
                            </span>
                            <button
                              onClick={() => setActiveLearningHubChapter({
                                chapterId: task.chapter_id,
                                chapterName: task.chapter_name,
                                subjectName: task.subject_name
                              })}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/80 border border-indigo-200 dark:border-indigo-500/40 text-indigo-700 dark:text-indigo-300 flex items-center gap-1 transition shadow-xs"
                              title="Open 4-Stage Learning Pipeline (Concept -> Practice -> Recall -> Assess)"
                            >
                              <BookOpen size={12} /> Study & Assess
                            </button>
                          </div>
                        </div>

                      ))
                    )}

                    {/* Unallocated / Free Revision Slot */}
                    {remainingMinutes > 0 && (
                      <div className="p-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20 text-center space-y-0.5">
                        <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                          + {remainingMinutes}m Free Revision / Rest Slot
                        </p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500">
                          Unlocks with next chapter completion
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}


      {activeTab === 'gap' && (
        <div className="space-y-6">
          <div className="flex items-start gap-4 bg-violet-50 dark:bg-violet-955/20 border border-violet-200 dark:border-violet-500/20 rounded-3xl p-6">
            <Lightbulb className="text-violet-600 dark:text-violet-400 shrink-0 mt-0.5" size={24} />
            <div className="space-y-1">
              <h3 className="text-lg font-semibold font-outfit text-violet-700 dark:text-violet-300">Opt-In Aptitude Gap Analysis</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                This panel maps your cognitive aptitude scores directly into concrete academic study recommendations. 
                <strong> Important note:</strong> This analysis is purely informational. In accordance with clinical EdTech requirements, cognitive performance scores do NOT influence the daily/weekly planner schedules.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6">
            {gapSuggestions.length === 0 ? (
              <div className="text-center py-16 text-slate-500 bg-slate-100/50 dark:bg-slate-900/20 border border-slate-200 dark:border-slate-800 rounded-3xl">
                Fantastic! All cognitive aptitude areas are above the 60% mastery threshold. No gaps detected.
              </div>
            ) : (
              gapSuggestions.map((s, idx) => (
                <div key={idx} className="glass-dark rounded-2xl p-6 border-l-4 border-l-violet-500 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border border-slate-200/40 dark:border-slate-800/40">
                  <div className="space-y-2 max-w-2xl">
                    <h4 className="text-lg font-bold text-slate-900 dark:text-slate-200 font-outfit">{s.category}</h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{s.suggestion}</p>
                  </div>
                  <div className="bg-white/85 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-center min-w-[100px]">
                    <span className="block text-[10px] uppercase font-semibold text-slate-500">Accuracy</span>
                    <span className="text-md font-bold font-mono text-violet-600 dark:text-violet-300">{s.accuracy}%</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

        </div>

        {/* Right column: Sidebar panel (rendered only when hasSidebar is true) */}
        {hasSidebar && (
          <div className="lg:col-span-1 space-y-6">
            {/* Resume Diagnostic Card */}
            <div className="glass-dark rounded-3xl p-6 border border-violet-500/35 dark:border-violet-850/20 bg-violet-50/10 dark:bg-violet-950/10 space-y-4 shadow-lg glow-purple animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div className="flex items-center gap-2">
                <Compass className="text-violet-650 dark:text-violet-400 shrink-0" size={18} />
                <h3 className="text-sm font-bold font-outfit text-slate-900 dark:text-slate-200">
                  Resume your diagnostic test
                </h3>
              </div>
              <p className="text-xs text-slate-550 dark:text-slate-400 leading-relaxed font-light">
                To improve your personalized recommendation, attempt all the diagnostics.
              </p>
              <button
                onClick={onResumeDiagnostic}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 transition shadow-md hover:scale-[1.01] active:scale-95"
              >
                Attempt Remaining Subjects
              </button>
            </div>
          </div>
        )}
      </div>
    );
  })()
)}




      {/* Completion Confirmation Overlay */}
      {completionForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden glow-purple">
            {/* Header */}
            <div className="p-6 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="text-green-500" size={20} />
                <h3 className="text-lg font-bold font-outfit text-slate-900 dark:text-slate-100">
                  Mark as Completed
                </h3>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-slate-700 dark:text-slate-300">{completionForm.chapterName}</span>
                <span className="mx-1.5">•</span>
                <span>{completionForm.subjectName}</span>
              </p>
              {completionForm.startTime && completionForm.endTime && (
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 flex items-center gap-1">
                  <Clock size={11} /> {completionForm.startTime} → {completionForm.endTime}
                </p>
              )}
            </div>

            {/* Body */}
            <div className="p-6 space-y-5">
              {/* Difficulty Rating */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  How difficult was this session? (Optional)
                </label>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => setCompletionForm({ ...completionForm, rating: completionForm.rating === star ? 0 : star })}
                      className={`p-1.5 rounded-lg transition ${
                        star <= completionForm.rating
                          ? 'text-amber-400 scale-110'
                          : 'text-slate-300 dark:text-slate-700 hover:text-amber-300 dark:hover:text-amber-500'
                      }`}
                    >
                      <Star size={22} fill={star <= completionForm.rating ? 'currentColor' : 'none'} />
                    </button>
                  ))}
                  <span className="ml-2 text-xs text-slate-400 dark:text-slate-500 self-center">
                    {completionForm.rating === 0 && 'Not rated'}
                    {completionForm.rating === 1 && 'Very Easy'}
                    {completionForm.rating === 2 && 'Easy'}
                    {completionForm.rating === 3 && 'Moderate'}
                    {completionForm.rating === 4 && 'Hard'}
                    {completionForm.rating === 5 && 'Very Hard'}
                  </span>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Quick notes (Optional)
                </label>
                <textarea
                  value={completionForm.notes}
                  onChange={(e) => setCompletionForm({ ...completionForm, notes: e.target.value.slice(0, 200) })}
                  placeholder="e.g., Need to revisit section 3.2..."
                  rows={3}
                  className="w-full bg-white/50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-violet-500 transition resize-none placeholder-slate-400 dark:placeholder-slate-600"
                />
                <span className="text-[10px] text-slate-400 dark:text-slate-600 mt-1 block text-right">
                  {completionForm.notes.length}/200
                </span>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 p-6 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setCompletionForm(null)}
                className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 text-xs font-bold px-4 py-2 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmCompletion}
                className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white text-xs font-bold px-5 py-2 rounded-xl shadow-lg hover:shadow-green-950/40 transition flex items-center gap-1.5"
              >
                <CheckCircle2 size={14} /> Confirm Completion
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Multi-Stage Chapter Learning Hub Modal */}
      {activeLearningHubChapter && (
        <ChapterLearningHubModal
          chapterId={activeLearningHubChapter.chapterId}
          chapterName={activeLearningHubChapter.chapterName}
          subjectName={activeLearningHubChapter.subjectName}
          studentId={studentId}
          onClose={() => setActiveLearningHubChapter(null)}
          onStartAssessment={(cid, cname, sname) => {
            setActiveLearningHubChapter(null);
            setActiveAssessmentChapter({
              chapterId: cid,
              chapterName: cname,
              subjectName: sname
            });
          }}
          onStageUpdated={() => {
            fetchDailyPlan();
            fetchWeeklyPlan();
          }}
        />
      )}

      {/* Chapter Assessment & Spaced Review Modal */}
      {activeAssessmentChapter && (
        <ChapterAssessmentModal
          studentId={studentId}
          chapterId={activeAssessmentChapter.chapterId}
          chapterName={activeAssessmentChapter.chapterName}
          subjectName={activeAssessmentChapter.subjectName}
          isSpacedReview={activeAssessmentChapter.isSpacedReview}
          onClose={() => setActiveAssessmentChapter(null)}
          onAssessmentCompleted={() => {
            fetchDailyPlan('knapsack', false);
            fetchWeeklyPlan();
            fetchAvailableChapters();
            fetchDueReviews();
          }}

        />
      )}

      {/* Dynamic Active Recall & Micro-Drill Test Modal */}
      {activeDynamicTestSlot && (
        <DynamicRecallTestModal
          isOpen={Boolean(activeDynamicTestSlot)}
          studentId={studentId}
          slot={activeDynamicTestSlot}
          onClose={() => setActiveDynamicTestSlot(null)}
          onComplete={(slotId) => {
            setCompletedDynamicSlotIds((prev) => [...prev, slotId]);
            fetchAvailableChapters();
            fetchDailyPlan('knapsack', false);
          }}
        />
      )}
    </div>
  );
}

