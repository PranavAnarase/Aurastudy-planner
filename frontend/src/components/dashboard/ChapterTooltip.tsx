/**
 * ChapterTooltip — Section hover/tap information card.
 *
 * Shown on hover (desktop) or tap (mobile/touch).
 * Contains: subject, chapter, time, status, mastery, deficiency,
 * parent-friendly explanation, and today's recommended activity.
 *
 * IMPORTANT: No calculations here. All values pre-computed by parent
 * from existing backend data. No technical jargon exposed to users.
 */

import React, { useEffect, useRef } from 'react';
import { X, Clock, BookOpen, Target, HelpCircle, Zap } from 'lucide-react';
import { TierPill } from './DashboardHeader';
import type { StudySlot, RevisionSlot, UnavailableSlot } from '../../types/dashboard';

export type TooltipSlot = StudySlot | RevisionSlot | UnavailableSlot;

interface ChapterTooltipProps {
  slot: TooltipSlot;
  onClose: () => void;
  /** Anchor position for desktop pointer-based placement */
  anchorRect?: DOMRect | null;
}

export default function ChapterTooltip({ slot, onClose, anchorRect }: ChapterTooltipProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Small delay so the triggering click doesn't instantly close
    const tid = setTimeout(() => document.addEventListener('mousedown', handler), 50);
    return () => {
      clearTimeout(tid);
      document.removeEventListener('mousedown', handler);
    };
  }, [onClose]);

  // ── Unavailable tooltip ──────────────────────────────────────────────────
  if (slot.kind === 'unavailable') {
    return (
      <TooltipShell ref={panelRef} onClose={onClose} anchorRect={anchorRect}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-slate-200 dark:bg-slate-700">
            <span className="text-sm" aria-hidden="true">🚫</span>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Unavailable
            </p>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
              {slot.label}
            </p>
          </div>
        </div>
        <InfoRow icon={<Clock size={13} />} label="Time">
          {slot.startTime} – {slot.endTime}
        </InfoRow>
        <InfoRow icon={<HelpCircle size={13} />} label="What this means">
          No study task is scheduled during this period. This is a normal part of your day.
        </InfoRow>
      </TooltipShell>
    );
  }

  // ── Revision tooltip ────────────────────────────────────────────────────
  if (slot.kind === 'revision') {
    return (
      <TooltipShell ref={panelRef} onClose={onClose} anchorRect={anchorRect}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-blue-500 dark:text-blue-400">
              Revision
            </p>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-tight">
              {slot.chapterName}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{slot.subjectName}</p>
          </div>
          <TierPill tier={slot.tier} />
        </div>

        <InfoRow icon={<Clock size={13} />} label="Time">
          {slot.startTime} – {slot.endTime}
        </InfoRow>
        <InfoRow icon={<Target size={13} />} label="Mastery">
          {slot.hasBeenAssessed ? `${Math.round(slot.masteryScore)}%` : 'Not assessed yet'}
        </InfoRow>
        {slot.daysOverdue > 0 && (
          <InfoRow icon={<Zap size={13} className="text-amber-500" />} label="Overdue">
            {slot.daysOverdue} day{slot.daysOverdue !== 1 ? 's' : ''} past due
          </InfoRow>
        )}
        <Divider />
        <InfoRow icon={<HelpCircle size={13} />} label="Why revision?">
          This chapter is scheduled for revision based on your review schedule.
        </InfoRow>
        <InfoRow icon={<BookOpen size={13} />} label="Today's activity">
          Quick revision — re-read key points and test yourself briefly.
        </InfoRow>
      </TooltipShell>
    );
  }

  // ── Study tooltip ───────────────────────────────────────────────────────
  const s = slot as StudySlot;
  const deficiency = s.hasBeenAssessed ? s.deficiency : null;

  return (
    <TooltipShell ref={panelRef} onClose={onClose} anchorRect={anchorRect}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 dark:text-indigo-400 truncate">
            {s.subjectName}
          </p>
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-tight">
            {s.chapterName}
          </p>
        </div>
        <TierPill tier={s.tier} />
      </div>

      {/* Time */}
      <InfoRow icon={<Clock size={13} />} label="Time">
        {s.startTime} – {s.endTime}
        <span className="ml-1.5 text-slate-400">({s.allocatedMinutes} min)</span>
      </InfoRow>

      {/* Mastery */}
      <InfoRow icon={<Target size={13} />} label="Mastery">
        {s.hasBeenAssessed ? (
          <>
            <span className={masteryColor(s.masteryScore)}>{Math.round(s.masteryScore)}%</span>
            <MasteryBar score={s.masteryScore} />
          </>
        ) : (
          <span className="text-slate-400 italic">Not assessed yet</span>
        )}
      </InfoRow>

      {/* Deficiency — only when assessed */}
      {s.hasBeenAssessed && deficiency !== null && (
        <InfoRow icon={<AlertTriangleIcon />} label="Gap">
          <span className={deficiency > 50 ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-amber-600 dark:text-amber-400 font-semibold'}>
            {deficiency}% learning gap remaining
          </span>
        </InfoRow>
      )}

      {/* Carried forward / spaced review badges */}
      {s.isCarriedForward && (
        <div className="mt-1 px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700/40 text-[11px] text-amber-700 dark:text-amber-300 font-medium">
          ⏩ Carried forward from yesterday
        </div>
      )}
      {s.isSpacedReview && (
        <div className="mt-1 px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-700/40 text-[11px] text-blue-700 dark:text-blue-300 font-medium">
          🔁 Spaced revision scheduled
        </div>
      )}

      <Divider />

      {/* Why this chapter */}
      <InfoRow icon={<HelpCircle size={13} />} label="Why this chapter?">
        <span className="text-slate-600 dark:text-slate-300">{s.whyExplanation}</span>
      </InfoRow>

      {/* Today's activity */}
      <InfoRow icon={<BookOpen size={13} />} label="Today's activity">
        <span className="text-slate-600 dark:text-slate-300">{s.activityDescription}</span>
      </InfoRow>

      {/* Status badge */}
      {s.status !== 'PENDING' && (
        <div className="mt-2">
          <StatusBadge status={s.status} />
        </div>
      )}
    </TooltipShell>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function masteryColor(score: number): string {
  if (score < 50) return 'text-red-600 dark:text-red-400 font-bold';
  if (score < 75) return 'text-amber-600 dark:text-amber-400 font-bold';
  return 'text-emerald-600 dark:text-emerald-400 font-bold';
}

function MasteryBar({ score }: { score: number }) {
  const color =
    score < 50
      ? 'bg-red-500'
      : score < 75
      ? 'bg-amber-500'
      : 'bg-emerald-500';
  return (
    <div className="inline-block ml-2 w-16 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden align-middle">
      <div
        className={`h-full rounded-full ${color}`}
        style={{ width: `${Math.max(4, score)}%` }}
        role="progressbar"
        aria-valuenow={Math.round(score)}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  );
}

function AlertTriangleIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-amber-500"
      aria-hidden="true"
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    COMPLETED: { label: '✓ Completed', cls: 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700/40' },
    IN_PROGRESS: { label: '▶ In Progress', cls: 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700/40' },
    SKIPPED: { label: '⏭ Skipped', cls: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700' },
  };
  const badge = map[status];
  if (!badge) return null;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.cls}`}>
      {badge.label}
    </span>
  );
}

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 py-1">
      <span className="shrink-0 mt-0.5 text-slate-400 dark:text-slate-500">{icon}</span>
      <div className="min-w-0">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 block leading-none mb-0.5">
          {label}
        </span>
        <span className="text-xs text-slate-700 dark:text-slate-300 leading-snug">{children}</span>
      </div>
    </div>
  );
}

function Divider() {
  return <hr className="border-slate-100 dark:border-slate-800 my-2" />;
}

// ── Tooltip shell (shared wrapper) ───────────────────────────────────────────

interface ShellProps {
  children: React.ReactNode;
  onClose: () => void;
  anchorRect?: DOMRect | null;
}

const TooltipShell = React.forwardRef<HTMLDivElement, ShellProps>(
  ({ children, onClose, anchorRect }, ref) => {
    // On mobile: fixed bottom sheet. On desktop: positioned near anchor.
    const isNarrow = typeof window !== 'undefined' && window.innerWidth < 640;

    const style: React.CSSProperties = {};
    if (!isNarrow && anchorRect) {
      // Try right side; flip left if near right edge
      const rightSpace = window.innerWidth - anchorRect.right;
      if (rightSpace > 280) {
        style.left = anchorRect.right + 8;
        style.top = Math.min(anchorRect.top, window.innerHeight - 400);
      } else {
        style.right = window.innerWidth - anchorRect.left + 8;
        style.top = Math.min(anchorRect.top, window.innerHeight - 400);
      }
    }

    return (
      <>
        {/* Backdrop for mobile */}
        <div
          className="fixed inset-0 z-40 sm:hidden bg-slate-950/40 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden="true"
        />

        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label="Chapter details"
          style={!isNarrow && anchorRect ? { ...style, position: 'fixed' } : {}}
          className={[
            'z-50 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700',
            'rounded-2xl shadow-2xl p-4',
            // Mobile: bottom sheet
            !anchorRect
              ? 'fixed bottom-0 left-0 right-0 sm:relative sm:bottom-auto rounded-b-none sm:rounded-2xl rounded-t-3xl w-full sm:w-72 max-h-[70vh] overflow-y-auto'
              : '',
          ].join(' ')}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            aria-label="Close details"
          >
            <X size={14} />
          </button>

          {children}
        </div>
      </>
    );
  }
);
TooltipShell.displayName = 'TooltipShell';
