/**
 * DashboardHeader — Section 1 of the Time Management Dashboard.
 *
 * Displays: selected day/date, available study time, planned study time,
 * and Critical / Developing / Mastered chapter counts.
 *
 * All values come directly from parent props — no calculations here.
 */

import React from 'react';
import { Calendar, Clock, AlertTriangle, TrendingUp, CheckCircle2 } from 'lucide-react';
import type { DashboardSummary } from '../../types/dashboard';

interface DashboardHeaderProps {
  summary: DashboardSummary;
}

function formatMinutes(mins: number): string {
  if (mins <= 0) return '0 min';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

export default function DashboardHeader({ summary }: DashboardHeaderProps) {
  const dayName = summary.date.toLocaleDateString('en-US', { weekday: 'long' });
  const fullDate = summary.date.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const isToday =
    summary.date.toDateString() === new Date().toDateString();

  return (
    <div className="rounded-3xl border border-indigo-200/70 dark:border-indigo-500/20 bg-gradient-to-br from-indigo-50/90 via-white to-purple-50/60 dark:from-indigo-950/40 dark:via-slate-900 dark:to-slate-900/90 shadow-sm dark:shadow-none p-5 sm:p-6 space-y-4">

      {/* Row 1 — Date label */}
      <div className="flex flex-wrap items-center gap-2">
        {isToday && (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-violet-600 text-white shadow-sm">
            Today
          </span>
        )}
        <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
          <Calendar size={16} className="text-indigo-500 shrink-0" />
          <h2 className="text-lg sm:text-xl font-extrabold font-outfit tracking-tight">
            {dayName}, {fullDate}
          </h2>
        </div>
      </div>

      {/* Row 2 — Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">

        {/* Available time */}
        <StatCard
          icon={<Clock size={14} className="text-violet-500" />}
          label="Available Time"
          value={formatMinutes(summary.totalAvailableMinutes)}
          colorClass="bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800/50 text-violet-800 dark:text-violet-200"
        />

        {/* Planned study */}
        <StatCard
          icon={<TrendingUp size={14} className="text-blue-500" />}
          label="Planned Study"
          value={formatMinutes(summary.plannedStudyMinutes)}
          colorClass="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/50 text-blue-800 dark:text-blue-200"
        />

        {/* Critical */}
        <StatCard
          icon={<AlertTriangle size={14} className="text-red-500" />}
          label="Critical"
          value={String(summary.criticalCount)}
          colorClass="bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/50 text-red-800 dark:text-red-200"
          sublabel="chapters"
        />

        {/* Developing */}
        <StatCard
          icon={<TrendingUp size={14} className="text-amber-500" />}
          label="Developing"
          value={String(summary.developingCount)}
          colorClass="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/50 text-amber-800 dark:text-amber-200"
          sublabel="chapters"
        />

        {/* Mastered */}
        <StatCard
          icon={<CheckCircle2 size={14} className="text-emerald-500" />}
          label="Mastered"
          value={String(summary.masteredCount)}
          colorClass="bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50 text-emerald-800 dark:text-emerald-200"
          sublabel="chapters"
        />
      </div>

    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  colorClass: string;
  sublabel?: string;
}

function StatCard({ icon, label, value, colorClass, sublabel }: StatCardProps) {
  return (
    <div className={`flex flex-col gap-1 px-3.5 py-2.5 rounded-2xl border ${colorClass}`}>
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide opacity-70">
        {icon}
        <span>{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-lg font-black font-outfit font-mono leading-none">
          {value}
        </span>
        {sublabel && (
          <span className="text-[10px] font-semibold opacity-60">{sublabel}</span>
        )}
      </div>
    </div>
  );
}

interface TierPillProps {
  tier: 'Critical' | 'Developing' | 'Mastered';
}

export function TierPill({ tier }: TierPillProps) {
  const styles = {
    Critical: 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700/50',
    Developing: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700/50',
    Mastered: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700/50',
  };
  const icons = { Critical: '🔴', Developing: '🟡', Mastered: '🟢' };

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${styles[tier]}`}
      aria-label={`Status: ${tier}`}
    >
      <span aria-hidden="true">{icons[tier]}</span>
      {tier}
    </span>
  );
}
