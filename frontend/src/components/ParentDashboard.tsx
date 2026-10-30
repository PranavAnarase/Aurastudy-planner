import React, { useState, useEffect, useRef } from 'react';
import { API_BASE_URL, AURASTUDY_V1_PREFIX } from '../config/api';
import {
  GraduationCap,
  Sparkles,
  Flame,
  Clock,
  BookOpen,
  Calculator,
  FlaskConical,
  Globe,
  Award,
  LogOut,
  RefreshCw,
  MessageCircle,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Lock,
  Moon,
  Sun,
  Shield,
  HeartHandshake,
  Share2,
  Calendar,
  CalendarDays,
  Trophy,
  Car,
  Repeat,
  Layers,
  AlertTriangle,
} from 'lucide-react';
import type { ParentDashboardResponse, ParentAuthResponse, SubjectMasteryCard, StudentCommitmentItem } from '../types/parent';

interface ParentDashboardProps {
  parentUser: ParentAuthResponse;
  onLogout: () => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

export default function ParentDashboard({
  parentUser,
  onLogout,
  theme = 'dark',
  onToggleTheme,
}: ParentDashboardProps) {
  const [data, setData] = useState<ParentDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [discussedItems, setDiscussedItems] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<'overview' | 'subjects' | 'schedule'>('overview');
  const dashboardReqIdRef = useRef(0);

  const fetchDashboardData = async (isSilent = false) => {
    const currentReq = ++dashboardReqIdRef.current;
    if (!isSilent) {
      if (!data) setLoading(true);
      else setRefreshing(true);
    }
    setError('');
    try {
      const res = await fetch(
        `${AURASTUDY_V1_PREFIX}/parent/dashboard-data?parent_id=${encodeURIComponent(
          parentUser.parent_id
        )}&student_username=${encodeURIComponent(parentUser.student_username)}`
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Unable to fetch child progress data.');
      }
      const json: ParentDashboardResponse = await res.json();
      if (currentReq === dashboardReqIdRef.current) {
        setData(json);
      }
    } catch (err: any) {
      if (!isSilent && currentReq === dashboardReqIdRef.current) {
        setError(err.message || 'Failed to connect to parent portal service.');
      }
    } finally {
      if (currentReq === dashboardReqIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    dashboardReqIdRef.current++;
    fetchDashboardData();

    // 1. Periodic background polling (every 5 seconds) to catch live updates
    const interval = setInterval(() => {
      fetchDashboardData(true);
    }, 5000);

    // 2. Cross-tab storage listener: fires when student finishes task/quiz in another tab
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'aura_last_task_update') {
        fetchDashboardData(true);
      }
    };
    window.addEventListener('storage', handleStorage);

    // 3. Focus / visibility listener: immediate refresh when returning to tab
    const handleFocus = () => {
      fetchDashboardData(true);
    };
    window.addEventListener('focus', handleFocus);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') fetchDashboardData(true);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      dashboardReqIdRef.current++;
    };
  }, [parentUser]);

  const toggleDiscussed = (id: string) => {
    setDiscussedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const getSubjectIcon = (iconName: string) => {
    switch (iconName) {
      case 'Calculator':
        return <Calculator className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />;
      case 'BookOpen':
        return <BookOpen className="w-5 h-5 text-rose-500 dark:text-rose-400" />;
      case 'FlaskConical':
        return <FlaskConical className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />;
      case 'Globe':
        return <Globe className="w-5 h-5 text-amber-500 dark:text-amber-400" />;
      default:
        return <GraduationCap className="w-5 h-5 text-purple-500 dark:text-purple-400" />;
    }
  };

  const getCommitmentIcon = (type: string) => {
    switch (type) {
      case 'College':
      case 'School':
        return <GraduationCap className="w-5 h-5 text-blue-500 dark:text-blue-400" />;
      case 'Tuition':
      case 'Coaching':
        return <BookOpen className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />;
      case 'Sports/Activity':
      case 'Sports':
        return <Trophy className="w-5 h-5 text-amber-500 dark:text-amber-400" />;
      case 'Travel':
        return <Car className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />;
      case 'Sleep':
        return <Moon className="w-5 h-5 text-purple-500 dark:text-purple-400" />;
      default:
        return <Clock className="w-5 h-5 text-slate-500 dark:text-slate-400" />;
    }
  };

  const getActionTypeBadge = (actionType?: string) => {
    switch (actionType) {
      case 'Prioritize':
        return (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-rose-500" /> Prioritize
          </span>
        );
      case 'Practice':
        return (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30 flex items-center gap-1">
            <BookOpen className="w-3 h-3 text-blue-500" /> Practice
          </span>
        );
      case 'Revise':
        return (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-500" /> Revise
          </span>
        );
      case 'Assess':
        return (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-purple-500" /> Assess
          </span>
        );
      case 'Continue':
      default:
        return (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Continue
          </span>
        );
    }
  };

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col items-center justify-center p-6">
        <div className="relative flex items-center justify-center mb-4">
          <div className="w-16 h-16 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
          <Sparkles className="w-6 h-6 text-indigo-500 dark:text-indigo-400 absolute animate-pulse" />
        </div>
        <h2 className="text-xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 dark:from-indigo-300 dark:via-purple-300 dark:to-pink-300 bg-clip-text text-transparent">
          Gathering Child's Learning Insights...
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Connecting securely to AuraStudy Parent Portal</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-red-200 dark:border-red-500/30 rounded-3xl p-8 text-center shadow-xl">
          <AlertCircle className="w-12 h-12 text-rose-500 dark:text-rose-400 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">Notice Loading Dashboard</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">{error || 'Data could not be loaded.'}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => fetchDashboardData(false)}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm flex items-center gap-2 transition shadow-md shadow-indigo-600/20"
            >
              <RefreshCw className="w-4 h-4" /> Try Again
            </button>
            <button
              onClick={onLogout}
              className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium text-sm transition"
            >
              Log Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  const {
    child_profile,
    live_presence,
    health_overview,
    actionable_guidance,
    subject_mastery,
    today_journey,
    all_commitments = [],
  } = data;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gradient-to-b dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 text-slate-900 dark:text-slate-100 selection:bg-indigo-500 selection:text-white pb-16 transition-colors duration-200">
      {/* 1. Global Parent Portal Navbar */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/80 dark:bg-slate-950/80 border-b border-indigo-100 dark:border-indigo-500/10 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center shadow-md shadow-indigo-500/20">
              <HeartHandshake className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-tight bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 dark:from-indigo-300 dark:via-purple-300 dark:to-pink-300 bg-clip-text text-transparent font-outfit">
                  AuraStudy
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-semibold border border-indigo-200 dark:border-indigo-500/20">
                  Parent Portal
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Welcome, {parentUser.full_name}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Live Data Refresh Button */}
            <button
              onClick={() => fetchDashboardData(false)}
              disabled={refreshing || loading}
              className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition shadow-xs flex items-center gap-1.5"
              title="Refresh child telemetry"
            >
              <RefreshCw className={`w-4 h-4 text-indigo-500 ${refreshing ? 'animate-spin' : ''}`} />
            </button>

            {onToggleTheme && (
              <button
                onClick={onToggleTheme}
                className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition shadow-xs"
                title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              >
                {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-600" />}
              </button>
            )}

            <button
              onClick={onLogout}
              className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:border-rose-300 dark:hover:border-rose-500/30 text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-300 transition shadow-xs"
              title="Log Out of Parent Portal"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {/* 2. Child Hero Card & Live Status Banner */}
        <section className="bg-gradient-to-r from-indigo-50/80 via-purple-50/60 to-pink-50/70 dark:from-indigo-950/60 dark:via-purple-950/40 dark:to-slate-900/70 border border-indigo-200 dark:border-indigo-500/20 rounded-3xl p-6 sm:p-8 backdrop-blur-md relative overflow-hidden shadow-xl dark:shadow-2xl">
          <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
            {/* Child Profile Info */}
            <div className="flex items-start sm:items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 p-0.5 shadow-xl flex-shrink-0">
                <div className="w-full h-full bg-white dark:bg-slate-950 rounded-[14px] flex items-center justify-center">
                  <GraduationCap className="w-8 h-8 text-indigo-600 dark:text-indigo-300" />
                </div>
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight font-outfit">{child_profile.full_name}</h1>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/80 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-mono">
                    @{child_profile.username}
                  </span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300 font-semibold">
                    {child_profile.standard_name}
                  </span>
                </div>

                <p className="text-sm text-slate-600 dark:text-slate-400 flex flex-wrap items-center gap-2">
                  <span>{child_profile.school_name || 'State Board Curriculum'}</span>
                  <span>•</span>
                  <span>{child_profile.medium} Medium</span>
                  <span>•</span>
                  <span className="text-indigo-600 dark:text-indigo-300 font-medium">Daily Target: {child_profile.daily_study_hours} hrs</span>
                </p>
              </div>
            </div>

            {/* Live Presence & Streak Chips */}
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-3">
              {/* Active Streak */}
              <div className="px-4 py-2.5 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 flex items-center gap-2.5 shadow-xs">
                <div className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-500/20">
                  <Flame className="w-4 h-4 text-amber-500 dark:text-amber-400 animate-bounce" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">{child_profile.streak_days}-Day Study Streak</p>
                  <p className="text-[11px] text-amber-600/90 dark:text-amber-400/80">Momentum is strong</p>
                </div>
              </div>

              {/* Pulse Active Badge */}
              <div className={`px-4 py-2.5 rounded-2xl flex items-center gap-2.5 shadow-xs ${
                live_presence.is_online
                  ? 'bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20'
                  : 'bg-slate-100 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/50'
              }`}>
                <div className="relative flex h-3 w-3">
                  {live_presence.is_online && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  )}
                  <span className={`relative inline-flex rounded-full h-3 w-3 ${
                    live_presence.is_online ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-slate-500'
                  }`}></span>
                </div>
                <div>
                  <p className={`text-xs font-semibold ${
                    live_presence.is_online ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-300'
                  }`}>{live_presence.last_active_text}</p>
                  <p className={`text-[11px] ${
                    live_presence.is_online ? 'text-emerald-600/90 dark:text-emerald-400/80' : 'text-slate-500 dark:text-slate-400'
                  }`}>{live_presence.last_activity_title}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 p-1.5 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl w-fit shadow-xs">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'overview'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            📊 Academic Health & Advice
          </button>
          <button
            onClick={() => setActiveTab('subjects')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'subjects'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            📚 Subject Mastery
          </button>
          {all_commitments.length > 0 && (
            <button
              onClick={() => setActiveTab('schedule')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
                activeTab === 'schedule'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              🔒 Student Commitments ({all_commitments.length})
            </button>
          )}
        </div>

        {/* 3. Academic Health Overview (3 Key Visual Gauges) */}
        {(activeTab === 'overview' || activeTab === 'subjects' || activeTab === 'schedule') && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2 font-outfit">
                <Sparkles className="w-4 h-4 text-indigo-500 dark:text-indigo-400" /> Academic Health at a Glance
              </h2>
              <span className="text-xs text-slate-500 font-medium">Read-Only Parent Summary</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* KPI 1: Study Discipline */}
              <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800/80 hover:border-indigo-300 dark:hover:border-indigo-500/30 rounded-3xl p-6 transition-all duration-300 shadow-md dark:shadow-lg relative overflow-hidden group">
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 text-indigo-600 dark:text-indigo-400">
                    <Clock className="w-6 h-6" />
                  </div>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-bold border ${
                      health_overview.study_discipline.status_level === 'high'
                        ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/20'
                        : health_overview.study_discipline.status_level === 'low'
                        ? 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/20'
                        : 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/20'
                    }`}
                  >
                    {health_overview.study_discipline.status_level === 'high' ? '🟢' : health_overview.study_discipline.status_level === 'low' ? '🔴' : '🟡'}{' '}
                    {health_overview.study_discipline.badge_label}
                  </span>
                </div>

                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight font-outfit">
                    {health_overview.study_discipline.formatted}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">Study Discipline</span>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 font-medium mb-3">{health_overview.study_discipline.explanation}</p>

                {/* Visual Progress Line */}
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 bg-gradient-to-r ${
                      health_overview.study_discipline.status_level === 'high'
                        ? 'from-indigo-500 to-emerald-400'
                        : health_overview.study_discipline.status_level === 'low'
                        ? 'from-red-500 to-orange-400'
                        : 'from-amber-400 to-indigo-400'
                    }`}
                    style={{ width: `${Math.min(100, health_overview.study_discipline.value)}%` }}
                  />
                </div>
              </div>

              {/* KPI 2: Average Retention */}
              <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800/80 hover:border-purple-300 dark:hover:border-purple-500/30 rounded-3xl p-6 transition-all duration-300 shadow-md dark:shadow-lg relative overflow-hidden group">
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 rounded-2xl bg-purple-50 dark:bg-purple-500/10 border border-purple-100 dark:border-purple-500/20 text-purple-600 dark:text-purple-400">
                    <Award className="w-6 h-6" />
                  </div>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-bold border ${
                      health_overview.average_retention.status_level === 'high'
                        ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/20'
                        : health_overview.average_retention.status_level === 'low'
                        ? 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/20'
                        : 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/20'
                    }`}
                  >
                    {health_overview.average_retention.status_level === 'high' ? '🟢' : health_overview.average_retention.status_level === 'low' ? '🔴' : '🟡'}{' '}
                    {health_overview.average_retention.badge_label}
                  </span>
                </div>

                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight font-outfit">
                    {health_overview.average_retention.formatted}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">Average Retention</span>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 font-medium mb-3">{health_overview.average_retention.explanation}</p>

                {/* Visual Progress Line */}
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 bg-gradient-to-r ${
                      health_overview.average_retention.status_level === 'high'
                        ? 'from-purple-500 to-emerald-400'
                        : health_overview.average_retention.status_level === 'low'
                        ? 'from-red-500 to-pink-400'
                        : 'from-purple-500 to-pink-400'
                    }`}
                    style={{ width: `${Math.min(100, health_overview.average_retention.value)}%` }}
                  />
                </div>
              </div>

              {/* KPI 3: Weekly Study Hours */}
              <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800/80 hover:border-pink-300 dark:hover:border-pink-500/30 rounded-3xl p-6 transition-all duration-300 shadow-md dark:shadow-lg relative overflow-hidden group">
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 rounded-2xl bg-pink-50 dark:bg-pink-500/10 border border-pink-100 dark:border-pink-500/20 text-pink-600 dark:text-pink-400">
                    <Flame className="w-6 h-6" />
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-bold border ${
                    health_overview.weekly_study_hours.status_level === 'high'
                      ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/20'
                      : health_overview.weekly_study_hours.status_level === 'low'
                      ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/20'
                      : 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/20'
                  }`}>
                    ⏱️ {health_overview.weekly_study_hours.badge_label}
                  </span>
                </div>

                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight font-outfit">
                    {health_overview.completed_study_hours}{' '}
                    <span className="text-lg font-normal text-slate-500 dark:text-slate-400">/ {health_overview.weekly_target_hours} hrs</span>
                  </span>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 font-medium mb-3">{health_overview.weekly_study_hours.explanation}</p>

                {/* Visual Progress Line */}
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-pink-500 to-rose-400 h-full rounded-full transition-all duration-1000"
                    style={{
                      width: `${Math.min(
                        100,
                        (health_overview.completed_study_hours / Math.max(1, health_overview.weekly_target_hours)) * 100
                      )}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 4. Actionable Guidance ("What You Can Do This Week") */}
        {(activeTab === 'overview' || activeTab === 'subjects') && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 font-outfit">
                  <MessageCircle className="w-5 h-5 text-indigo-500 dark:text-indigo-400" /> What You Can Do This Week
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Actionable, non-technical conversation ideas for home and dinner chats</p>
              </div>
              <span className="text-xs px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/20 font-semibold">
                {actionable_guidance.length} Guidance Prompts
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {actionable_guidance.map((item) => {
                const isDiscussed = !!discussedItems[item.id];
                return (
                  <div
                    key={item.id}
                    className={`rounded-3xl p-6 border transition-all duration-300 relative overflow-hidden ${
                      isDiscussed
                        ? 'bg-slate-100/70 dark:bg-slate-900/40 border-slate-300 dark:border-slate-800 opacity-80'
                        : 'bg-white dark:bg-gradient-to-br dark:from-slate-900/90 dark:via-indigo-950/20 dark:to-slate-900/90 border-slate-200 dark:border-indigo-500/20 shadow-md dark:shadow-xl'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        {getActionTypeBadge(item.action_type)}
                        <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/20">
                          {item.tag}
                        </span>
                        {item.subject_hint && (
                          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">• {item.subject_hint}</span>
                        )}
                      </div>

                      <button
                        onClick={() => toggleDiscussed(item.id)}
                        className={`text-xs px-3 py-1 rounded-xl font-medium flex items-center gap-1.5 transition shrink-0 ${
                          isDiscussed
                            ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/30'
                            : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {isDiscussed ? 'Discussed with Child' : 'Mark Discussed'}
                      </button>
                    </div>

                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">{item.title}</h3>
                    
                    <div className="space-y-2 mb-4">
                      <div>
                        <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">Recommended Parent Action:</p>
                        <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-medium">{item.description}</p>
                      </div>

                      {item.why_reason && (
                        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 text-xs">
                          <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-0.5">
                            💡 Why:
                          </p>
                          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{item.why_reason}</p>
                        </div>
                      )}
                    </div>

                    {/* Quotation / Prompt Box */}
                    <div className="p-3.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-500/20 text-indigo-900 dark:text-indigo-200">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-1">
                        👉 Try Asking This:
                      </p>
                      <p className="text-xs italic font-medium leading-relaxed">{item.try_saying}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 5. Subject-Wise Progress & Mastery Table / Cards */}
        {(activeTab === 'overview' || activeTab === 'subjects') && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 font-outfit">
                  <BookOpen className="w-5 h-5 text-indigo-500 dark:text-indigo-400" /> Subject-Wise Progress & Mastery
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Chapters finished and tailored home support coaching</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {subject_mastery.map((subj: SubjectMasteryCard) => {
                return (
                  <div
                    key={subj.subject_id}
                    className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 hover:border-slate-300 dark:hover:border-slate-700 transition shadow-md dark:shadow-lg flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                            {getSubjectIcon(subj.icon_name)}
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{subj.subject_name}</h3>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              {subj.chapters_completed} of {subj.total_chapters} Chapters Done
                            </p>
                          </div>
                        </div>

                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-full font-bold border transition-colors ${
                            subj.status_level === 'high'
                              ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/20'
                              : subj.status_level === 'medium'
                              ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/20'
                              : subj.status_level === 'low'
                              ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/20'
                              : 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/20'
                          }`}
                        >
                          {subj.status_badge}
                        </span>
                      </div>

                      {/* Progress Bar */}
                      <div className="space-y-1.5 mb-4">
                        <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                          <span>Syllabus Covered</span>
                          <span className="font-semibold text-slate-700 dark:text-slate-300">{subj.progress_percentage}%</span>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 h-full rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, Math.max(0, subj.progress_percentage))}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Home Support Coaching Card */}
                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                          <Sparkles className="w-3 h-3 text-amber-500 dark:text-amber-400" /> Home Support Action:
                        </p>
                        {getActionTypeBadge(subj.action_type)}
                      </div>
                      <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-medium">{subj.home_support_suggestion}</p>
                      {subj.action_reason && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-1.5 border-t border-slate-200 dark:border-slate-800/60 leading-relaxed">
                          <span className="font-semibold text-slate-600 dark:text-slate-300">Why: </span>
                          {subj.action_reason}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 6. All Student Commitments (Read-Only Format) — Only displayed if student has selected commitments */}
        {all_commitments.length > 0 && (activeTab === 'overview' || activeTab === 'schedule') && (
          <section className="space-y-6">
            {/* Section Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 font-outfit">
                  <Shield className="w-5 h-5 text-indigo-500 dark:text-indigo-400" /> Student Selected Commitments
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Read-only view of commitments configured by {child_profile.first_name}
                </p>
              </div>
              <span className="text-xs px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 font-medium w-fit">
                <Lock className="w-3.5 h-3.5 text-indigo-500" /> Read-Only View
              </span>
            </div>

            {/* Commitments Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {all_commitments.map((comm) => {
                const icon = getCommitmentIcon(comm.commitment_type);
                const ALL_WEEK_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

                return (
                  <div
                    key={comm.id}
                    className="rounded-3xl p-5 bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-500/30 transition shadow-sm flex flex-col justify-between"
                  >
                    <div>
                      {/* Top Row: Type Badge + Icon */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800">
                            {icon}
                          </div>
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200/80 dark:border-slate-700">
                            {comm.commitment_type}
                          </span>
                        </div>
                        <span className="text-[11px] px-2.5 py-0.5 rounded-full font-bold bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/20 flex items-center gap-1">
                          <Lock className="w-3 h-3 text-indigo-500" /> Protected
                        </span>
                      </div>

                      {/* Title */}
                      <h4 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1.5 font-outfit">
                        {comm.label}
                      </h4>

                      {/* Time Range */}
                      <div className="flex items-center gap-2 mb-3">
                        <Clock className="w-4 h-4 text-indigo-500" />
                        <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-300 bg-indigo-50/60 dark:bg-indigo-950/40 px-2.5 py-1 rounded-lg border border-indigo-100 dark:border-indigo-900/60">
                          {comm.time_range}
                        </span>
                      </div>

                      {/* Recurrence Display & Days of Week Chips */}
                      <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                        <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                          <Repeat className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-medium">{comm.recurrence_display}</span>
                        </div>

                        {comm.days_of_week && comm.days_of_week.length > 0 && (
                          <div className="flex items-center gap-1 flex-wrap pt-1">
                            {ALL_WEEK_DAYS.map((d) => {
                              const isActive = comm.days_of_week?.includes(d);
                              return (
                                <span
                                  key={d}
                                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md font-mono transition ${
                                    isActive
                                      ? 'bg-indigo-600 text-white shadow-xs'
                                      : 'bg-slate-100 dark:bg-slate-800/60 text-slate-400'
                                  }`}
                                >
                                  {d}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Footer Status */}
                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Student Configured
                      </span>
                      <span className="font-mono text-[10px]">Read-Only</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
