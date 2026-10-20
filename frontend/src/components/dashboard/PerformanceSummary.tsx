/**
 * PerformanceSummary — Section below the time grid.
 *
 * Shows:
 *  1. Today's focus chapter with reason (why was it selected).
 *  2. All-subjects performance overview (Critical / Developing / Mastered chips).
 *
 * All values come from props pre-computed by the parent.
 * No calculations performed here. No technical jargon exposed.
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, AlertTriangle, TrendingUp, CheckCircle2, Target } from 'lucide-react';
import { TierPill } from './DashboardHeader';
import type { SubjectInfo, MasteryTier, DashboardSummary } from '../../types/dashboard';
import { deriveTier } from '../../types/dashboard';

interface PerformanceSummaryProps {
  summary: DashboardSummary;
  subjects: SubjectInfo[];
}

export default function PerformanceSummary({ summary, subjects }: PerformanceSummaryProps) {
  const [expanded, setExpanded] = useState(false);

  const totalChapters = subjects.reduce((s, sub) => s + sub.total_chapters_count, 0);
  const masteredChapters = subjects.reduce((s, sub) => s + sub.mastered_chapters_count, 0);

  return (
    <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 glass-dark shadow-sm dark:shadow-none overflow-hidden">

      {/* Section header */}
      <div className="px-5 pt-5 pb-3 border-b border-slate-100 dark:border-slate-800/60 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Target size={16} className="text-indigo-500 shrink-0" />
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
            Subject Performance Overview
          </h3>
        </div>
        <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">
          {masteredChapters}/{totalChapters} chapters mastered
        </span>
      </div>

      {/* Summary row — always visible */}
      <div className="px-5 py-4 flex flex-wrap gap-3">
        <SummaryChip
          icon={<AlertTriangle size={13} className="text-red-500" />}
          count={summary.criticalCount}
          label="Critical"
          chipClass="bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-300"
        />
        <SummaryChip
          icon={<TrendingUp size={13} className="text-amber-500" />}
          count={summary.developingCount}
          label="Developing"
          chipClass="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/40 text-amber-700 dark:text-amber-300"
        />
        <SummaryChip
          icon={<CheckCircle2 size={13} className="text-emerald-500" />}
          count={summary.masteredCount}
          label="Mastered"
          chipClass="bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-300"
        />
      </div>

      {/* Today's focus */}
      {summary.todayFocusChapter && (
        <div className="mx-5 mb-4 p-4 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/30 border border-indigo-200/70 dark:border-indigo-700/40 space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 dark:text-indigo-400">
            Today's Priority Focus
          </p>
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                {summary.todayFocusSubject} — {summary.todayFocusChapter}
              </p>
              {summary.todayFocusReason && (
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-snug">
                  {summary.todayFocusReason}
                </p>
              )}
            </div>
            {summary.todayFocusTier && <TierPill tier={summary.todayFocusTier} />}
          </div>
        </div>
      )}

      {/* Per-subject breakdown — expandable */}
      {subjects.length > 0 && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition border-t border-slate-100 dark:border-slate-800/60"
            aria-expanded={expanded}
          >
            <span>
              {expanded ? 'Hide' : 'Show'} all subject details
            </span>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {expanded && (
            <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {subjects.map((subj) => (
                <SubjectCard key={subj.subject_name} subj={subj} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryChip({
  icon,
  count,
  label,
  chipClass,
}: {
  icon: React.ReactNode;
  count: number;
  label: string;
  chipClass: string;
}) {
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border ${chipClass}`}>
      {icon}
      <span className="text-sm font-black font-mono">{count}</span>
      <span className="text-xs font-semibold">{label}</span>
    </div>
  );
}

function SubjectCard({ subj }: { subj: SubjectInfo }) {
  const tier = deriveTier(subj.subject_mastery_score);
  const barColor = tier === 'Critical' ? 'bg-red-500' : tier === 'Developing' ? 'bg-amber-500' : 'bg-emerald-500';

  const tierLabel: Record<MasteryTier, string> = {
    Critical: 'Needs Focus',
    Developing: 'Developing',
    Mastered: 'Strong',
  };

  return (
    <div className="p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white/70 dark:bg-slate-900/40 space-y-2">
      <div className="flex items-start justify-between gap-1">
        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-tight">
          {subj.subject_name}
        </p>
        <span
          className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 ${
            tier === 'Critical'
              ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700/40'
              : tier === 'Developing'
              ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700/40'
              : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700/40'
          }`}
        >
          {tierLabel[tier]}
        </span>
      </div>

      {/* Mastery bar */}
      <div>
        <div className="flex justify-between text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
          <span>Mastery</span>
          <span className="font-mono font-bold">{Math.round(subj.subject_mastery_score)}%</span>
        </div>
        <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${Math.max(4, subj.subject_mastery_score)}%` }}
            role="progressbar"
            aria-valuenow={Math.round(subj.subject_mastery_score)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${subj.subject_name} mastery`}
          />
        </div>
      </div>

      <p className="text-[10px] text-slate-400 dark:text-slate-500">
        {subj.mastered_chapters_count}/{subj.total_chapters_count} chapters at a strong level
      </p>
    </div>
  );
}
