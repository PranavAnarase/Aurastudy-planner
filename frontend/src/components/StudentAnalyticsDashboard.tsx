import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { AURASTUDY_V1_PREFIX } from '../config/api';
import { 
  TrendingUp, Clock, CheckCircle2, AlertTriangle, Sparkles, 
  BarChart3, RefreshCw, Search, X, ChevronRight, BookOpen, 
  Zap, ArrowUpRight, ArrowDownRight, Target
} from 'lucide-react';

interface AnalyticsData {
  kpis: {
    totalAssessments: number;
    overallAccuracy: number;
    masteredChaptersCount: number;
    averageSpeedSeconds: number;
  };
  charts: {
    scoreTimeline: {
      data: Array<{
        assessmentId: number;
        date: string;
        fullDate?: string;
        score: number;
        obtainedMarks?: number;
        totalMarks?: number;
        attemptNumber?: number;
        subject: string;
        subjectName?: string;
        chapter: string;
        chapterTitle?: string;
        avgSpeedSeconds?: number;
        tier?: string;
        label: string;
      }>;
      insightText: string;
      summary?: {
        recent5Average: number;
        consistencyRate: number;
        trajectoryDelta: number;
        trendType: string;
        totalTestsPlotted: number;
        nextMilestone: string;
      };
    };
    subjectMastery: {
      data: Array<{
        subjectId: number;
        subjectName: string;
        masteryScore: number;
        activeChaptersCount: number;
        tier: string;
      }>;
      insightText: string;
    };
  };
  diagnostics: {
    topStrengths: Array<{
      chapterId: number;
      title: string;
      subject: string;
      mastery: number;
    }>;
    focusPriorities: Array<{
      chapterId: number;
      title: string;
      subject: string;
      mastery: number;
    }>;
  };
  history: Array<{
    assessmentId: number;
    dateFormatted: string;
    subjectName: string;
    chapterTitle: string;
    attemptNumber: number;
    scoreFormatted: string;
    accuracy: number;
    tierBadge: string;
    aiOverallSummary?: string | null;
  }>;
}

interface HistoricalReviewData {
  assessmentId: number;
  studentId: number;
  chapterId: number;
  chapterTitle: string;
  subjectName: string;
  attemptNumber: number;
  score: number;
  totalMarks: number;
  accuracy: number;
  dateFormatted: string;
  aiOverallSummary?: string | null;
  questions: Array<{
    questionId: number;
    questionText: string;
    options: Record<string, string | null>;
    selectedOption: string | null;
    correctOption: string;
    isCorrect: boolean;
    timeTaken: number;
    standardExplanation?: string | null;
    aiFeedback?: {
      conceptGap?: string | null;
      misconceptionExplanation?: string | null;
      memoryTip?: string | null;
    } | null;
  }>;
}

interface StudentAnalyticsDashboardProps {
  studentId: number;
  onTakeAssessment?: (chapterId: number) => void;
}

export default function StudentAnalyticsDashboard({ studentId }: StudentAnalyticsDashboardProps) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // History table search and filtering
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState('ALL');
  
  // Historical Review Sheet Modal state
  const [selectedReviewId, setSelectedReviewId] = useState<number | null>(null);
  const [reviewData, setReviewData] = useState<HistoricalReviewData | null>(null);
  const [loadingReview, setLoadingReview] = useState(false);

  // Score Journey chart hover and filter scope state
  const [hoveredPointIdx, setHoveredPointIdx] = useState<number | null>(null);
  const [journeyScope, setJourneyScope] = useState<'ALL' | '10' | '20'>('ALL');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchAnalytics = async (silent: boolean = false) => {
    if (!silent) setLoading(true);
    else setIsRefreshing(true);
    setError('');
    try {
      const res = await fetch(`${AURASTUDY_V1_PREFIX}/assessment/analytics?user_id=${encodeURIComponent(String(studentId))}`);
      if (!res.ok) throw new Error('Failed to load student performance analytics.');
      const result = await res.json();
      setData(result);
    } catch (err: any) {
      if (!silent) setError(err.message || 'Error loading analytics.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (studentId) {
      fetchAnalytics();
    }
  }, [studentId]);

  // Live Auto-Refresh Listener when any assessment is completed
  useEffect(() => {
    const handleAssessmentCompleted = () => {
      if (studentId) {
        fetchAnalytics(true);
      }
    };
    window.addEventListener('assessment_completed', handleAssessmentCompleted);
    return () => {
      window.removeEventListener('assessment_completed', handleAssessmentCompleted);
    };
  }, [studentId]);

  const reviewRequestIdRef = useRef(0);

  const handleCloseReviewModal = useCallback(() => {
    reviewRequestIdRef.current++;
    setSelectedReviewId(null);
    setReviewData(null);
  }, []);

  useEffect(() => {
    if (selectedReviewId === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCloseReviewModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedReviewId, handleCloseReviewModal]);

  // Fetch full review sheet when a historical attempt is clicked
  const handleOpenReviewSheet = async (assessmentId: number) => {
    const currentReq = ++reviewRequestIdRef.current;
    setSelectedReviewId(assessmentId);
    setLoadingReview(true);
    try {
      const res = await fetch(`${AURASTUDY_V1_PREFIX}/assessment/history/review-sheet?assessment_id=${encodeURIComponent(String(assessmentId))}`);
      if (!res.ok) throw new Error('Failed to load historical review sheet.');
      const sheet = await res.json();
      if (currentReq === reviewRequestIdRef.current) {
        setReviewData(sheet);
      }
    } catch (err: any) {
      if (currentReq === reviewRequestIdRef.current) {
        alert(err.message || 'Could not load review sheet.');
        setSelectedReviewId(null);
      }
    } finally {
      if (currentReq === reviewRequestIdRef.current) {
        setLoadingReview(false);
      }
    }
  };

  const filteredHistory = useMemo(() => {
    if (!data?.history) return [];
    return data.history.filter((item) => {
      const matchesSearch = 
        item.chapterTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.subjectName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesSubject = 
        selectedSubjectFilter === 'ALL' || item.subjectName === selectedSubjectFilter;
      return matchesSearch && matchesSubject;
    });
  }, [data?.history, searchQuery, selectedSubjectFilter]);

  const uniqueSubjects = useMemo(() => {
    if (!data?.history) return [];
    return Array.from(new Set(data.history.map((h) => h.subjectName)));
  }, [data?.history]);

  const allTimelinePoints = data?.charts?.scoreTimeline?.data || [];
  const visiblePoints = useMemo(() => {
    if (journeyScope === '10') return allTimelinePoints.slice(-10);
    if (journeyScope === '20') return allTimelinePoints.slice(-20);
    return allTimelinePoints;
  }, [allTimelinePoints, journeyScope]);


  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <RefreshCw className="w-10 h-10 text-indigo-500 animate-spin" />
        <p className="text-slate-600 dark:text-slate-300 font-semibold text-sm">Aggregating real-time performance analytics...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center bg-white dark:bg-slate-900/95 border border-rose-200 dark:border-rose-500/40 rounded-2xl max-w-xl mx-auto my-12 shadow-md dark:shadow-rose-950/30">
        <AlertTriangle className="w-10 h-10 text-rose-500 dark:text-rose-400 mx-auto mb-3" />
        <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">Analytics Unavailable</h3>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{error || 'Could not retrieve performance data.'}</p>
        <button 
          onClick={() => fetchAnalytics()}
          className="mt-4 px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-all shadow-md"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fadeIn">
      
      {/* ========================================================================= */}
      {/* ZONE 1: KPI Health Check Cards (Light & Dark Friendly) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        
        {/* Total Tests */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/95 border border-indigo-200/80 dark:border-indigo-500/40 shadow-sm dark:shadow-indigo-950/30 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-indigo-100 dark:border-indigo-500/20">
            <h4 className="text-xs font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Tests Completed</h4>
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/40">
              <BookOpen className="w-5 h-5" />
            </div>
          </div>
          <div className="pt-1">
            <p className="text-3xl font-black text-slate-900 dark:text-white">{data.kpis.totalAssessments}</p>
            <p className="text-xs text-slate-500 dark:text-slate-300 font-medium mt-1">Standard 7 Chapter Assessments</p>
          </div>
        </div>

        {/* Overall Accuracy */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/95 border border-emerald-200/80 dark:border-emerald-500/40 shadow-sm dark:shadow-emerald-950/30 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-emerald-100 dark:border-emerald-500/20">
            <h4 className="text-xs font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Average Accuracy</h4>
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/40">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="pt-1">
            <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400">{data.kpis.overallAccuracy}%</p>
            <div className="w-full bg-slate-100 dark:bg-slate-950 h-2 rounded-full mt-2.5 overflow-hidden border border-slate-200 dark:border-slate-800">
              <div 
                className="bg-emerald-500 h-full rounded-full transition-all duration-500 shadow-sm" 
                style={{ width: `${Math.min(100, data.kpis.overallAccuracy)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Average Pace */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/95 border border-violet-200/80 dark:border-violet-500/40 shadow-sm dark:shadow-violet-950/30 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-violet-100 dark:border-violet-500/20">
            <h4 className="text-xs font-black uppercase tracking-wider text-violet-600 dark:text-violet-400">Average Pace</h4>
            <div className="p-2 rounded-xl bg-violet-50 dark:bg-violet-500/20 text-violet-600 dark:text-violet-300 border border-violet-200 dark:border-violet-500/40">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="pt-1">
            <p className="text-3xl font-black text-violet-600 dark:text-violet-300">{data.kpis.averageSpeedSeconds}s</p>
            <p className="text-xs text-slate-500 dark:text-slate-300 font-medium mt-1">Per Question Solving Time</p>
          </div>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* ZONE 2 & ZONE 3: Score Journey Line Chart & Subject Power Balance */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* ZONE 2: "My Score Journey" Visual Analytics Card (7 Columns) */}
        <div className="lg:col-span-7 p-6 rounded-2xl bg-white dark:bg-slate-900/95 border border-indigo-200/80 dark:border-indigo-500/40 shadow-sm dark:shadow-indigo-950/30 space-y-4">
          
          {/* Layer 1: Card Header Summary & Momentum Strip */}
          <div className="space-y-3 pb-3 border-b border-indigo-100 dark:border-indigo-500/20">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-500/40 text-indigo-600 dark:text-indigo-300">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-400">My Score Journey</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-300 mt-0.5">Real-time test-by-test performance trajectory</p>
                </div>
              </div>

              {/* Right side: Scope filter & live Sync button */}
              <div className="flex items-center gap-2">
                {/* Scope selector */}
                <div className="flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[10px] font-bold">
                  <button
                    onClick={() => setJourneyScope('ALL')}
                    className={`px-2 py-0.5 rounded-md transition-all ${
                      journeyScope === 'ALL'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    All ({allTimelinePoints.length})
                  </button>
                  {allTimelinePoints.length > 10 && (
                    <button
                      onClick={() => setJourneyScope('10')}
                      className={`px-2 py-0.5 rounded-md transition-all ${
                        journeyScope === '10'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Last 10
                    </button>
                  )}
                  {allTimelinePoints.length > 20 && (
                    <button
                      onClick={() => setJourneyScope('20')}
                      className={`px-2 py-0.5 rounded-md transition-all ${
                        journeyScope === '20'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Last 20
                    </button>
                  )}
                </div>

                {/* Live Sync button */}
                <button
                  onClick={() => fetchAnalytics(true)}
                  title="Sync Real-Time Telemetry"
                  className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-950 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 transition-all flex items-center gap-1 text-[11px] font-semibold"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Momentum Strip Metrics */}
            {data.charts.scoreTimeline.summary && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">5-Test Avg:</span>
                  <span className="font-mono font-black text-slate-900 dark:text-white text-xs">
                    {data.charts.scoreTimeline.summary.recent5Average}%
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Consistency:</span>
                  <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-xs">
                    {data.charts.scoreTimeline.summary.consistencyRate}%
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Plotted:</span>
                  <span className="font-mono font-black text-indigo-600 dark:text-indigo-300 text-xs">
                    {visiblePoints.length} of {allTimelinePoints.length}
                  </span>
                </div>

                {/* Trajectory pill in strip */}
                <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 flex items-center justify-center">
                  {(() => {
                    const summary = data.charts.scoreTimeline.summary;
                    const trendType = summary?.trendType || 'STEADY';
                    const delta = summary?.trajectoryDelta || 0;

                    if (trendType === 'UPWARD') {
                      return (
                        <span className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-700 dark:text-emerald-400">
                          <ArrowUpRight className="w-3.5 h-3.5" />
                          <span>+{delta}% Upward</span>
                        </span>
                      );
                    } else if (trendType === 'DOWNWARD') {
                      return (
                        <span className="inline-flex items-center gap-1 text-[11px] font-black text-rose-700 dark:text-rose-400">
                          <ArrowDownRight className="w-3.5 h-3.5" />
                          <span>{delta}% Shift</span>
                        </span>
                      );
                    }
                    return (
                      <span className="text-[11px] font-black text-indigo-700 dark:text-indigo-400">
                        ⚖️ Steady
                      </span>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* Layer 2: Interactive SVG Chart Canvas */}
          <div className="relative pt-4 pb-2">
            {visiblePoints.length === 0 ? (
              <div className="h-56 flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/60 dark:bg-slate-950/60">
                <Target className="w-8 h-8 text-slate-400 dark:text-slate-500 mb-2" />
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">No Assessment Data Yet</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Complete chapter tests to chart your learning curve.</p>
              </div>
            ) : (
              <div className="relative">
                <svg className="w-full h-56 overflow-visible" viewBox="0 0 500 200" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="scoreAreaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#818CF8" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="#818CF8" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Benchmark Grid Lines */}
                  {/* 90% Line */}
                  <line x1="0" y1="38" x2="500" y2="38" stroke="#10B981" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.9" />
                  <text x="5" y="32" fill="#059669" className="dark:fill-[#34D399]" fontSize="10" fontWeight="bold">90% Mastery Goal</text>

                  {/* 50% Line */}
                  <line x1="0" y1="110" x2="500" y2="110" stroke="#F59E0B" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.9" />
                  <text x="5" y="104" fill="#D97706" className="dark:fill-[#FBBF24]" fontSize="10" fontWeight="bold">50% Passing Threshold</text>

                  {/* Calculate SVG Coordinates */}
                  {(() => {
                    const count = visiblePoints.length;
                    const coords = visiblePoints.map((pt, i) => {
                      const x = count === 1 ? 250 : 20 + (i / (count - 1)) * 460;
                      const y = 190 - (pt.score / 100) * 160;
                      return { x, y, pt, i };
                    });

                    // Build line path
                    const linePath = coords.reduce((acc, curr, i) => {
                      return i === 0 ? `M ${curr.x} ${curr.y}` : `${acc} L ${curr.x} ${curr.y}`;
                    }, '');

                    // Build area path
                    const areaPath = coords.length > 0 
                      ? `${linePath} L ${coords[coords.length - 1].x} 190 L ${coords[0].x} 190 Z`
                      : '';

                    return (
                      <>
                        <path d={areaPath} fill="url(#scoreAreaGradient)" />
                        <path d={linePath} fill="none" stroke="#6366F1" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

                        {coords.map((c) => {
                          const isHovered = hoveredPointIdx === c.i;
                          const isMastered = c.pt.score >= 90;
                          const isPassing = c.pt.score >= 50;
                          const dotColor = isMastered ? '#10B981' : (isPassing ? '#6366F1' : '#F43F5E');

                          return (
                            <g key={c.i} className="cursor-pointer">
                              <circle 
                                cx={c.x} 
                                cy={c.y} 
                                r={isHovered ? 7.5 : 5} 
                                fill={dotColor} 
                                stroke="#FFFFFF" 
                                strokeWidth="2.5"
                                onMouseEnter={() => setHoveredPointIdx(c.i)}
                                onMouseLeave={() => setHoveredPointIdx(null)}
                              />
                            </g>
                          );
                        })}
                      </>
                    );
                  })()}
                </svg>

                {/* Layer 3: Rich Hover Tooltip Overlay */}
                {hoveredPointIdx !== null && visiblePoints[hoveredPointIdx] && (
                  <div 
                    className="absolute z-20 bg-white/95 dark:bg-slate-950/95 border border-indigo-200 dark:border-indigo-500/50 p-3.5 rounded-xl shadow-xl text-xs pointer-events-none transform -translate-x-1/2 -translate-y-full min-w-[230px]"
                    style={{
                      left: `${visiblePoints.length === 1 ? 50 : 4 + (hoveredPointIdx / (visiblePoints.length - 1)) * 92}%`,
                      top: `${Math.max(10, 190 - (visiblePoints[hoveredPointIdx].score / 100) * 160 - 20)}px`
                    }}
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-1.5 mb-1.5">
                      <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 font-bold">
                        {visiblePoints[hoveredPointIdx].fullDate || visiblePoints[hoveredPointIdx].date}
                      </span>
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-50 dark:bg-slate-800 text-indigo-700 dark:text-indigo-300">
                        Attempt #{visiblePoints[hoveredPointIdx].attemptNumber || 1}
                      </span>
                    </div>

                    <p className="font-bold text-slate-900 dark:text-white text-xs truncate">
                      {visiblePoints[hoveredPointIdx].subjectName || visiblePoints[hoveredPointIdx].subject}: {visiblePoints[hoveredPointIdx].chapterTitle || visiblePoints[hoveredPointIdx].chapter}
                    </p>

                    <div className="flex items-center justify-between text-[11px] mt-2 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                      <span className="text-slate-600 dark:text-slate-300">
                        Score: <strong className="text-emerald-600 dark:text-emerald-400 font-bold">{visiblePoints[hoveredPointIdx].obtainedMarks ?? visiblePoints[hoveredPointIdx].score}/{visiblePoints[hoveredPointIdx].totalMarks ?? 10}</strong> ({visiblePoints[hoveredPointIdx].score}%)
                      </span>
                      <span className="text-slate-500 dark:text-slate-300 font-mono">
                        ⚡ {visiblePoints[hoveredPointIdx].avgSpeedSeconds || 0}s/q
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Layer 4: Contextual Action & Milestone Footer */}
          <div className="space-y-2.5 pt-1">
            <div className="p-3.5 rounded-xl bg-indigo-50/80 dark:bg-slate-950/90 border border-indigo-100 dark:border-indigo-500/40 flex items-start gap-2.5 text-xs text-indigo-950 dark:text-indigo-100 font-medium">
              <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400 mt-0.5 flex-shrink-0" />
              <p className="leading-relaxed">{data.charts.scoreTimeline.insightText}</p>
            </div>

            {data.charts.scoreTimeline.summary?.nextMilestone && (
              <div className="p-3 rounded-xl bg-gradient-to-r from-indigo-50/90 via-white to-white dark:from-indigo-950/50 dark:via-slate-950 dark:to-slate-950 border border-indigo-200/80 dark:border-indigo-500/30 flex items-center gap-2.5 text-xs text-indigo-900 dark:text-indigo-200 shadow-xs">
                <Target className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {data.charts.scoreTimeline.summary.nextMilestone}
                </span>
              </div>
            )}
          </div>

        </div>



        {/* ZONE 3: "Subject Power Balance" Active Mastery (5 Columns) */}
        <div className="lg:col-span-5 p-6 rounded-2xl bg-white dark:bg-slate-900/95 border border-emerald-200/80 dark:border-emerald-500/40 shadow-sm dark:shadow-emerald-950/30 space-y-4">
          <div className="flex items-center gap-2.5 pb-2 border-b border-emerald-100 dark:border-emerald-500/20">
            <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/20 border border-emerald-200 dark:border-emerald-500/40 text-emerald-600 dark:text-emerald-300">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Subject Power Balance</h3>
              <p className="text-xs text-slate-500 dark:text-slate-300 mt-0.5">Active working mastery across your subjects</p>
            </div>
          </div>

          {/* Subject Horizontal Mastery Bars */}
          <div className="space-y-3 pt-1">
            {data.charts.subjectMastery.data.map((subj) => {
              const score = subj.masteryScore;
              let barColor = 'bg-rose-500';
              let badgeColor = 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/20 border-rose-200 dark:border-rose-500/30';

              if (score >= 90) {
                barColor = 'bg-emerald-500';
                badgeColor = 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/20 border-emerald-200 dark:border-emerald-500/30';
              } else if (score >= 50) {
                barColor = 'bg-indigo-500';
                badgeColor = 'text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/20 border-indigo-200 dark:border-indigo-500/30';
              }

              return (
                <div key={subj.subjectName} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/90 border border-slate-200 dark:border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-800 dark:text-slate-100">{subj.subjectName}</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-md border font-black ${badgeColor}`}>
                        {subj.tier}
                      </span>
                      <span className="font-mono font-black text-slate-900 dark:text-white">{score}%</span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-200/80 dark:bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-200 dark:border-slate-800">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 shadow-sm ${barColor}`}
                      style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Dynamic Subject Insight Banner */}
          <div className="p-3.5 rounded-xl bg-amber-50/80 dark:bg-slate-950/90 border border-amber-200 dark:border-amber-500/40 flex items-start gap-2.5 text-xs text-amber-950 dark:text-amber-100 font-medium mt-2">
            <Zap className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <p className="leading-relaxed">{data.charts.subjectMastery.insightText}</p>
          </div>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* ZONE 4: Strengths vs. Revision Priorities (Light & Dark Friendly) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Top Strengths */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/95 border border-emerald-200/80 dark:border-emerald-500/40 shadow-sm dark:shadow-emerald-950/30 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-emerald-100 dark:border-emerald-500/20">
            <div className="flex items-center gap-2.5 text-emerald-600 dark:text-emerald-400">
              <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/20 border border-emerald-200 dark:border-emerald-500/40 text-emerald-600 dark:text-emerald-300">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <h4 className="text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                Top Mastered Topics (Keep It Up!)
              </h4>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
              ≥ 50% Mastery
            </span>
          </div>

          {data.diagnostics.topStrengths.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 italic py-3 text-center">
              Score ≥ 50% on assessments to unlock your mastered topics badge wall.
            </p>
          ) : (
            <div className="space-y-2.5 pt-1">
              {data.diagnostics.topStrengths.map((st) => (
                <div 
                  key={st.chapterId}
                  className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/90 border border-slate-200 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-500/50 flex items-center justify-between gap-3 transition-all shadow-xs group"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 font-bold text-[11px] border border-emerald-200 dark:border-emerald-500/30 shrink-0">
                      {st.subject}
                    </span>
                    <span className="text-slate-800 dark:text-slate-100 font-semibold text-xs truncate group-hover:text-emerald-700 dark:group-hover:text-emerald-200 transition-colors">
                      {st.title}
                    </span>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-600 dark:bg-emerald-500 text-white dark:text-slate-950 font-black text-xs font-mono shadow-xs shrink-0">
                    {st.mastery}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Revision Priorities */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/95 border border-rose-200/80 dark:border-rose-500/40 shadow-sm dark:shadow-rose-950/30 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-rose-100 dark:border-rose-500/20">
            <div className="flex items-center gap-2.5 text-rose-600 dark:text-rose-400">
              <div className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-500/20 border border-rose-200 dark:border-rose-500/40 text-rose-600 dark:text-rose-300">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <h4 className="text-xs font-black uppercase tracking-wider text-rose-700 dark:text-rose-400">
                Revision Priorities (Scheduled for Review)
              </h4>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-500/20 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30">
              Focus Areas
            </span>
          </div>

          {data.diagnostics.focusPriorities.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 italic py-3 text-center">
              🎉 No critical revision areas! All assessed topics are above 50% mastery.
            </p>
          ) : (
            <div className="space-y-2.5 pt-1">
              {data.diagnostics.focusPriorities.map((fp) => (
                <div 
                  key={fp.chapterId}
                  className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/90 border border-slate-200 dark:border-slate-800 hover:border-rose-300 dark:hover:border-rose-500/50 flex items-center justify-between gap-3 transition-all shadow-xs group"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className="px-2.5 py-1 rounded-lg bg-rose-100 dark:bg-rose-500/20 text-rose-800 dark:text-rose-300 font-bold text-[11px] border border-rose-200 dark:border-rose-500/30 shrink-0">
                      {fp.subject}
                    </span>
                    <span className="text-slate-800 dark:text-slate-100 font-semibold text-xs truncate group-hover:text-rose-700 dark:group-hover:text-rose-200 transition-colors">
                      {fp.title}
                    </span>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-rose-600 dark:bg-rose-500 text-white font-black text-xs font-mono shadow-xs shrink-0">
                    {fp.mastery}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>


      {/* ========================================================================= */}
      {/* ZONE 5: Assessment History & Detailed Review Logs Table (Light & Dark Friendly) */}
      {/* ========================================================================= */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/95 border border-indigo-200/80 dark:border-indigo-500/40 shadow-sm dark:shadow-indigo-950/30 space-y-5">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-2 border-b border-indigo-100 dark:border-indigo-500/20">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-500/40 text-indigo-600 dark:text-indigo-300">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
                Assessment History & Review Logs
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-300 mt-0.5">Review previous attempts, answer keys, and stored AI diagnostics.</p>
            </div>
          </div>

          {/* Search and Subject Filter */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search chapter..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <select
              value={selectedSubjectFilter}
              onChange={(e) => setSelectedSubjectFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">All Subjects</option>
              {uniqueSubjects.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {/* History Table */}

        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/80">
          <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 text-[11px] uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">Date & Time</th>
                <th className="py-3 px-4">Subject</th>
                <th className="py-3 px-4">Chapter Title</th>
                <th className="py-3 px-4 text-center">Attempt</th>
                <th className="py-3 px-4 text-center">Score</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400 font-medium">
                    No matching assessment logs found.
                  </td>
                </tr>
              ) : (
                filteredHistory.map((item) => (
                  <tr key={item.assessmentId} className="hover:bg-slate-50 dark:hover:bg-slate-900/60 transition-colors">
                    <td className="py-3 px-4 font-mono text-slate-500 dark:text-slate-300">{item.dateFormatted}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-bold text-[11px] border border-indigo-200 dark:border-indigo-500/30">
                        {item.subjectName}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-800 dark:text-slate-100 font-semibold">{item.chapterTitle}</td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-slate-700 dark:text-slate-200">#{item.attemptNumber}</td>
                    <td className="py-3 px-4 text-center font-mono font-black text-slate-900 dark:text-white">
                      {item.scoreFormatted} ({item.accuracy}%)
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        item.tierBadge === 'Mastered' 
                          ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/40'
                          : item.tierBadge === 'Developing'
                          ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-800 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-500/40'
                          : 'bg-rose-100 dark:bg-rose-500/20 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-500/40'
                      }`}>
                        {item.tierBadge}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleOpenReviewSheet(item.assessmentId)}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-all inline-flex items-center gap-1 shadow-xs"
                      >
                        <span>View Review</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* HISTORICAL REVIEW SHEET MODAL (Light & Dark Friendly) */}
      {/* ========================================================================= */}
      {selectedReviewId !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="review-sheet-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/85 backdrop-blur-md animate-fadeIn"
        >
          <div className="relative w-full max-w-4xl max-h-[90vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-indigo-500/40 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-indigo-500/20 bg-slate-50 dark:bg-slate-950">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase text-indigo-600 dark:text-indigo-400 tracking-wider">Historical Review Sheet</span>
                  <span className="text-slate-400 dark:text-slate-500">•</span>
                  <span className="text-xs text-slate-500 dark:text-slate-300 font-mono font-bold">Attempt #{reviewData?.attemptNumber || 1}</span>
                </div>
                <h3 id="review-sheet-modal-title" className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                  {reviewData?.subjectName}: {reviewData?.chapterTitle}
                </h3>
              </div>

              <button
                onClick={handleCloseReviewModal}
                aria-label="Close review modal"
                className="p-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50/50 dark:bg-transparent">
              {loadingReview || !reviewData ? (
                <div className="py-20 flex flex-col items-center justify-center space-y-3">
                  <RefreshCw className="w-8 h-8 text-indigo-500 dark:text-indigo-400 animate-spin" />
                  <p className="text-xs text-slate-600 dark:text-slate-300 font-semibold">Loading stored test responses and AI feedback...</p>
                </div>
              ) : (
                <>
                  {/* Attempt Summary Pill Card */}
                  <div className="p-4 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 shadow-xs">
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-[10px] uppercase font-bold text-slate-400">Score Achieved</p>
                        <p className="text-xl font-black text-indigo-600 dark:text-indigo-300">{reviewData.score} / {reviewData.totalMarks} ({reviewData.accuracy}%)</p>
                      </div>
                      <div className="w-px h-8 bg-slate-200 dark:bg-slate-800" />
                      <div>
                        <p className="text-[10px] uppercase font-bold text-slate-400">Attempted On</p>
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{reviewData.dateFormatted}</p>
                      </div>
                    </div>

                    <span className={`px-3 py-1 rounded-full text-xs font-black uppercase ${
                      reviewData.accuracy >= 90 
                        ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/40'
                        : reviewData.accuracy >= 50
                        ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-800 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-500/40'
                        : 'bg-rose-100 dark:bg-rose-500/20 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-500/40'
                    }`}>
                      {reviewData.accuracy >= 90 ? 'Mastered' : (reviewData.accuracy >= 50 ? 'Passing' : 'Needs Focus')}
                    </span>
                  </div>

                  {/* Assessment-Item-Wise Outcome Breakdown Graph */}
                  {(() => {
                    const totalQ = reviewData.questions.length;
                    const rightQ = reviewData.questions.filter(q => q.isCorrect).length;
                    const wrongQ = reviewData.questions.filter(q => !q.isCorrect && q.selectedOption).length;
                    const unattemptedQ = reviewData.questions.filter(q => !q.selectedOption).length;
                    const attemptedQ = totalQ - unattemptedQ;
                    const rightPct = totalQ > 0 ? (rightQ / totalQ) * 100 : 0;
                    const wrongPct = totalQ > 0 ? (wrongQ / totalQ) * 100 : 0;
                    const unattemptedPct = totalQ > 0 ? (unattemptedQ / totalQ) * 100 : 0;

                    return (
                      <div className="p-4 rounded-xl bg-white dark:bg-slate-950 border border-indigo-200/80 dark:border-indigo-500/30 space-y-3 shadow-xs">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-400 flex items-center gap-2">
                            <BarChart3 className="w-4 h-4" />
                            <span>Assessment Item Breakdown Graph</span>
                          </h4>
                          <span className="text-[11px] font-mono font-bold text-slate-600 dark:text-slate-300">
                            {attemptedQ} of {totalQ} Attempted
                          </span>
                        </div>

                        {/* Visual Outcome Stacked Bar */}
                        <div className="w-full bg-slate-100 dark:bg-slate-900 h-3 rounded-full overflow-hidden flex border border-slate-200 dark:border-slate-800 shadow-inner">
                          <div style={{ width: `${rightPct}%` }} className="bg-emerald-500 h-full transition-all" title={`Right (Correct): ${rightQ}`} />
                          <div style={{ width: `${wrongPct}%` }} className="bg-rose-500 h-full transition-all" title={`Wrong (Incorrect): ${wrongQ}`} />
                          <div style={{ width: `${unattemptedPct}%` }} className="bg-slate-400 dark:bg-slate-600 h-full transition-all" title={`Unattempted: ${unattemptedQ}`} />
                        </div>

                        {/* Counts grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                          <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-center">
                            <span className="block text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase">Right (Correct)</span>
                            <span className="text-base font-black font-mono text-emerald-800 dark:text-emerald-300">{rightQ}</span>
                          </div>
                          <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-center">
                            <span className="block text-[10px] font-bold text-rose-700 dark:text-rose-400 uppercase">Wrong (Incorrect)</span>
                            <span className="text-base font-black font-mono text-rose-800 dark:text-rose-300">{wrongQ}</span>
                          </div>
                          <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center">
                            <span className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase">Unattempted</span>
                            <span className="text-base font-black font-mono text-slate-800 dark:text-slate-300">{unattemptedQ}</span>
                          </div>
                          <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 text-center">
                            <span className="block text-[10px] font-bold text-indigo-700 dark:text-indigo-400 uppercase">Total Items</span>
                            <span className="text-base font-black font-mono text-indigo-800 dark:text-indigo-300">{totalQ}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Stored Overall AI Summary if available */}
                  {reviewData.aiOverallSummary && (
                    <div className="p-4 rounded-xl bg-purple-50/70 dark:bg-slate-950 border border-purple-200 dark:border-purple-500/40 shadow-xs">
                      <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300 mb-1.5">
                        <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                        <h4 className="text-xs font-black uppercase tracking-wider">AI Diagnostic Tutor Summary</h4>
                      </div>
                      <p className="text-xs text-slate-800 dark:text-slate-100 leading-relaxed font-normal">
                        {reviewData.aiOverallSummary}
                      </p>
                    </div>
                  )}

                  {/* Question Breakdown List */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-black text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      Question by Question Log ({reviewData.questions.length} Items)
                    </h4>

                    {reviewData.questions.map((q, idx) => {
                      const isUnattempted = !q.selectedOption;
                      return (
                        <div 
                          key={q.questionId}
                          className={`p-4 rounded-xl border text-xs space-y-3 ${
                            q.isCorrect 
                              ? 'bg-white dark:bg-slate-950 border-emerald-200 dark:border-emerald-500/40 shadow-xs' 
                              : isUnattempted
                              ? 'bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 shadow-xs'
                              : 'bg-white dark:bg-slate-950 border-rose-200 dark:border-rose-500/40 shadow-xs'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900 dark:text-white text-sm">
                              Q{idx + 1}. {q.questionText}
                            </span>
                            <span className={`px-2.5 py-0.5 rounded font-black uppercase ${
                              q.isCorrect 
                                ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/40' 
                                : isUnattempted
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700'
                                : 'bg-rose-100 dark:bg-rose-500/20 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-500/40'
                            }`}>
                              {q.isCorrect ? 'Correct' : (isUnattempted ? 'Unattempted' : 'Incorrect')}
                            </span>
                          </div>

                          {/* Options List */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                            {Object.entries(q.options).map(([letter, text]) => {
                              if (!text) return null;
                              const isSelected = q.selectedOption === letter;
                              const isCorrectOpt = q.correctOption === letter;

                              let optStyle = 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300';
                              if (isCorrectOpt) {
                                optStyle = 'bg-emerald-100/80 dark:bg-emerald-500/20 border-emerald-300 dark:border-emerald-500/50 text-emerald-900 dark:text-emerald-200 font-bold';
                              } else if (isSelected && !q.isCorrect) {
                                optStyle = 'bg-rose-100/80 dark:bg-rose-500/20 border-rose-300 dark:border-rose-500/50 text-rose-900 dark:text-rose-200 line-through';
                              }

                              return (
                                <div key={letter} className={`p-2.5 rounded-lg border text-xs flex items-center gap-2 ${optStyle}`}>
                                  <span className="font-bold">{letter})</span>
                                  <span>{text}</span>
                                </div>
                              );
                            })}
                          </div>

                          {/* User answer vs correct option summary */}
                          <div className="flex items-center gap-4 text-slate-700 dark:text-slate-200 pt-1 text-xs">
                            <span>Your Answer: <strong className={q.isCorrect ? 'text-emerald-600 dark:text-emerald-400 font-black' : (isUnattempted ? 'text-slate-500 font-black' : 'text-rose-600 dark:text-rose-400 font-black')}>{q.selectedOption || 'Unattempted'}</strong></span>
                            <span>Correct Option: <strong className="text-emerald-600 dark:text-emerald-400 font-black">{q.correctOption}</strong></span>
                            <span>Time Spent: <strong className="text-slate-900 dark:text-slate-100">{q.timeTaken}s</strong></span>
                          </div>

                          {/* AI Micro-Concept Gap */}
                          {q.aiFeedback?.conceptGap && (
                            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-100 dark:bg-indigo-500/20 border border-indigo-300 dark:border-indigo-500/40 text-[11px] font-black text-indigo-800 dark:text-indigo-300">
                              <span>🎯 Micro-Concept Gap:</span>
                              <span className="text-slate-900 dark:text-white font-medium">{q.aiFeedback.conceptGap}</span>
                            </div>
                          )}

                          {/* AI Contrastive Misconception Explanation */}
                          {q.aiFeedback?.misconceptionExplanation && (
                            <div className="text-slate-800 dark:text-slate-100 bg-indigo-50/70 dark:bg-slate-900/90 p-3.5 rounded-xl border border-indigo-200 dark:border-indigo-500/30 text-xs leading-relaxed">
                              <div className="flex items-center gap-1.5 font-black text-indigo-700 dark:text-indigo-300 mb-1">
                                <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                                <span>Contrastive Tutor Breakdown:</span>
                              </div>
                              <p className="text-slate-700 dark:text-slate-200 font-normal">{q.aiFeedback.misconceptionExplanation}</p>
                            </div>
                          )}

                          {/* AI Memory Formula & Hook */}
                          {q.aiFeedback?.memoryTip && (
                            <div className="text-amber-900 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 p-3 rounded-xl border border-amber-200 dark:border-amber-500/40 text-xs leading-relaxed flex items-start gap-2.5">
                              <Zap className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                              <div>
                                <span className="font-black text-amber-800 dark:text-amber-300">Memory Formula & Hook: </span>
                                <span className="text-amber-950 dark:text-amber-100">{q.aiFeedback.memoryTip}</span>
                              </div>
                            </div>
                          )}

                          {/* Standard Textbook Explanation */}
                          {q.standardExplanation && (
                            <p className="text-slate-600 dark:text-slate-300 italic bg-slate-100/80 dark:bg-slate-900/80 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                              💡 Textbook Note: {q.standardExplanation}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>


            {/* Modal Footer */}
            <div className="px-6 py-3.5 border-t border-slate-100 dark:border-indigo-500/20 bg-slate-50 dark:bg-slate-950 flex justify-end">
              <button
                onClick={handleCloseReviewModal}
                className="px-5 py-2 text-xs font-bold rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-white transition-colors"
              >
                Close Review Sheet
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
