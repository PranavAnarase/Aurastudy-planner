/**
 * TimeSlotBlock — a single card in the time-slot grid.
 *
 * HOVER FIX: uses a leave-delay timer (120 ms) so moving the pointer from
 * the card to the tooltip panel does not blink/close the panel.
 * The timer is cancelled any time the pointer re-enters either the card
 * OR the panel — whichever comes first.  This is the standard "hover bridge"
 * pattern used by production tooltip libraries.
 *
 * Mobile: tap card → toggle panel (no hover involved).
 * Keyboard: Enter/Space → toggle, Escape → close.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  CheckCircle2, RefreshCw, Minus, Clock, Target,
  BookOpen, HelpCircle, Zap, X, TrendingUp, AlertTriangle,
  Brain, Sparkles, Play
} from 'lucide-react';
import { TierPill } from './DashboardHeader';
import type {
  TimeSlot, StudySlot, RevisionSlot, UnavailableSlot, DynamicTestSlot
} from '../../types/dashboard';

const LEAVE_DELAY_MS = 120; // time to wait before closing after mouse leaves

/* ─────────────────────────────────────────────────────────────────────────────
   Main card component
───────────────────────────────────────────────────────────────────────────── */

interface Props {
  slot: TimeSlot;
  onStartDynamicTest?: (slot: DynamicTestSlot) => void;
}

export default function TimeSlotBlock({ slot, onStartDynamicTest }: Props) {
  const [open, setOpen] = useState(false);

  // Refs to the card div and the floating panel div
  const cardRef  = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Single shared timer ref — cancels close when pointer bridges card → panel
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const interactive =
    slot.kind === 'study' ||
    slot.kind === 'revision' ||
    slot.kind === 'unavailable' ||
    slot.kind === 'dynamic_test';

  // ── Pointer enter on card or panel ────────────────────────────────────
  function handlePointerEnter() {
    if (!interactive) return;
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
    setOpen(true);
  }

  // ── Pointer leave from card or panel ──────────────────────────────────
  function handlePointerLeave() {
    if (!interactive) return;
    // Schedule close — will be cancelled if pointer enters panel/card
    leaveTimer.current = setTimeout(() => {
      setOpen(false);
      leaveTimer.current = null;
    }, LEAVE_DELAY_MS);
  }

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    };
  }, []);

  // ── Keyboard ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open]);

  // ── Close on click outside (both card and panel) ──────────────────────
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      const inCard  = cardRef.current?.contains(e.target as Node);
      const inPanel = panelRef.current?.contains(e.target as Node);
      if (!inCard && !inPanel) setOpen(false);
    };
    // Tiny delay so the triggering click doesn't immediately close
    const tid = setTimeout(() => document.addEventListener('mousedown', h), 60);
    return () => {
      clearTimeout(tid);
      document.removeEventListener('mousedown', h);
    };
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (interactive) {
        if (leaveTimer.current) {
          clearTimeout(leaveTimer.current);
          leaveTimer.current = null;
        }
        setOpen(true);
      }
    }
  };

  // Click opens panel without toggling closed
  const handleClick = () => {
    if (interactive) {
      if (leaveTimer.current) {
        clearTimeout(leaveTimer.current);
        leaveTimer.current = null;
      }
      setOpen(true);
    }
  };

  function handleCardBlur(e: React.FocusEvent) {
    if (!interactive) return;
    const related = e.relatedTarget as Node | null;
    if (related && (cardRef.current?.contains(related) || panelRef.current?.contains(related))) {
      if (leaveTimer.current) {
        clearTimeout(leaveTimer.current);
        leaveTimer.current = null;
      }
      return;
    }
    handlePointerLeave();
  }

  function handlePanelBlur(e: React.FocusEvent) {
    if (!interactive) return;
    const related = e.relatedTarget as Node | null;
    if (related && (cardRef.current?.contains(related) || panelRef.current?.contains(related))) {
      return;
    }
    handlePointerLeave();
  }

  return (
    <div className="relative">
      {/* ── Card ── */}
      <div
        ref={cardRef}
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-expanded={interactive ? open : undefined}
        aria-haspopup={interactive ? 'dialog' : undefined}
        aria-label={interactive ? ariaLabel(slot) : undefined}
        onClick={handleClick}
        onMouseEnter={handlePointerEnter}
        onMouseLeave={handlePointerLeave}
        onFocus={handlePointerEnter}
        onBlur={handleCardBlur}
        onKeyDown={interactive ? handleKeyDown : undefined}
        className={[
          'relative flex flex-col justify-between rounded-2xl border overflow-hidden',
          'h-32 p-3 transition-all duration-150 select-none',
          cardStyles(slot),
          interactive
            ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 hover:scale-[1.02] hover:shadow-md'
            : '',
        ].join(' ')}
      >
        {/* Top row: time + badge */}
        <div className="flex items-start justify-between gap-1">
          <span className="text-[9px] font-mono font-bold text-slate-500 dark:text-slate-400 leading-tight">
            {slot.startTime}
            <br />
            <span className="opacity-70">{slot.endTime}</span>
          </span>
          <KindBadge slot={slot} />
        </div>

        {/* Middle: subject / chapter / tier */}
        <div className="flex-1 flex items-center mt-1">
          <CardBody slot={slot} />
        </div>

        {/* Bottom: duration */}
        <span className="self-end text-[9px] font-mono text-slate-400 dark:text-slate-500">
          {slot.durationMinutes}m
        </span>

        {/* Colour strip */}
        <div
          className={`absolute bottom-0 left-0 right-0 h-1 ${bottomStrip(slot)}`}
          aria-hidden="true"
        />
      </div>

      {/* ── Floating detail panel ── */}
      {open && interactive && (
        <TooltipPanel
          ref={panelRef}
          slot={slot as StudySlot | RevisionSlot | UnavailableSlot | DynamicTestSlot}
          onClose={() => setOpen(false)}
          onMouseEnter={handlePointerEnter}
          onMouseLeave={handlePointerLeave}
          onFocus={handlePointerEnter}
          onBlur={handlePanelBlur}
          onStartDynamicTest={onStartDynamicTest}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Card sub-components
───────────────────────────────────────────────────────────────────────────── */

function KindBadge({ slot }: { slot: TimeSlot }) {
  if (slot.kind === 'unavailable') {
    return (
      <span className="text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-slate-300/70 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-600">
        Busy
      </span>
    );
  }
  if (slot.kind === 'dynamic_test') {
    const d = slot as DynamicTestSlot;
    const isMorning = d.activityType === 'FIRST_GAP_RETENTION_TEST';
    const isDrill = d.activityType === 'MICRO_DRILL';
    return (
      <span className={`text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md border flex items-center gap-0.5 ${
        isMorning
          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700/60 animate-pulse'
          : isDrill
          ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-700/60'
          : 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700/60'
      }`}>
        <Brain size={8} aria-hidden="true" /> {d.badgeLabel || 'Recall'}
      </span>
    );
  }
  if (slot.kind === 'revision') {
    return (
      <span className="text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-700/40 flex items-center gap-0.5">
        <RefreshCw size={8} aria-hidden="true" /> Rev
      </span>
    );
  }
  if (slot.kind === 'study') {
    const s = slot as StudySlot;
    if (s.status === 'COMPLETED')   return <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />;
    if (s.status === 'IN_PROGRESS') return <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping shrink-0" />;
    if (s.status === 'SKIPPED')     return <Minus size={12} className="text-slate-400 shrink-0" />;
  }
  return null;
}

function CardBody({ slot }: { slot: TimeSlot }) {
  if (slot.kind === 'unavailable') {
    return (
      <div>
        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide leading-tight">
          {(slot as UnavailableSlot).label}
        </p>
        <p className="text-[9px] text-slate-400 mt-0.5">Unavailable</p>
      </div>
    );
  }
  if (slot.kind === 'free')  return <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">Free Time</p>;
  if (slot.kind === 'break') return <p className="text-[9px] text-slate-400 dark:text-slate-500">Break</p>;
  if (slot.kind === 'dynamic_test') {
    const d = slot as DynamicTestSlot;
    return (
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-1">
          <Sparkles size={10} className="text-indigo-500 shrink-0" />
          <p className="text-[9px] font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-400 truncate">
            {d.title}
          </p>
        </div>
        <p className="text-[11px] font-bold text-slate-800 dark:text-slate-100 leading-tight line-clamp-2">
          {d.subtitle}
        </p>
        <div className="flex items-center gap-1.5 pt-0.5">
          <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300">
            {d.questionCount} Qs
          </span>
        </div>
      </div>
    );
  }
  if (slot.kind === 'revision') {
    const r = slot as RevisionSlot;
    return (
      <div className="min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-wide text-blue-500 dark:text-blue-400 truncate">{r.subjectName}</p>
        <p className="text-[11px] font-bold text-slate-800 dark:text-slate-100 leading-tight line-clamp-2 mt-0.5">{r.chapterName}</p>
      </div>
    );
  }
  if (slot.kind === 'study') {
    const s = slot as StudySlot;
    return (
      <div className="min-w-0 space-y-0.5">
        <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 truncate">{s.subjectName}</p>
        <p className="text-[11px] font-bold text-slate-800 dark:text-slate-100 leading-tight line-clamp-2">{s.chapterName}</p>
        <TierPill tier={s.tier} />
      </div>
    );
  }
  return null;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Style helpers
───────────────────────────────────────────────────────────────────────────── */

function cardStyles(slot: TimeSlot): string {
  switch (slot.kind) {
    case 'dynamic_test': {
      const d = slot as DynamicTestSlot;
      if (d.activityType === 'FIRST_GAP_RETENTION_TEST') {
        return 'bg-gradient-to-br from-emerald-50/90 to-indigo-50/70 dark:from-emerald-950/30 dark:to-indigo-950/30 border-emerald-300 dark:border-emerald-600/60 ring-1 ring-emerald-400/30 shadow-sm';
      }
      if (d.activityType === 'MICRO_DRILL') {
        return 'bg-gradient-to-br from-purple-50/90 to-pink-50/70 dark:from-purple-950/30 dark:to-pink-950/30 border-purple-300 dark:border-purple-600/60 ring-1 ring-purple-400/30 shadow-sm';
      }
      return 'bg-gradient-to-br from-indigo-50/90 to-blue-50/70 dark:from-indigo-950/30 dark:to-blue-950/30 border-indigo-300 dark:border-indigo-600/60 ring-1 ring-indigo-400/30 shadow-sm';
    }
    case 'study': {
      const s = slot as StudySlot;
      if (s.status === 'COMPLETED')
        return 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700 opacity-70';
      if (s.tier === 'Critical')
        return 'bg-red-50 dark:bg-red-950/25 border-red-200 dark:border-red-800/50';
      if (s.tier === 'Developing')
        return 'bg-amber-50 dark:bg-amber-950/25 border-amber-200 dark:border-amber-800/50';
      return 'bg-emerald-50 dark:bg-emerald-950/25 border-emerald-200 dark:border-emerald-800/50';
    }
    case 'revision':
      return 'bg-blue-50 dark:bg-blue-950/25 border-blue-200 dark:border-blue-800/50';
    case 'unavailable':
      return 'bg-slate-100 dark:bg-slate-800/60 border-slate-300 dark:border-slate-600 unavailable-hatch';
    case 'free':
      return 'bg-white/50 dark:bg-slate-900/20 border-dashed border-slate-200 dark:border-slate-700';
    case 'break':
      return 'bg-slate-50/40 dark:bg-slate-900/10 border-slate-100 dark:border-slate-800/40 !h-16';
    default:
      return 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700';
  }
}

function bottomStrip(slot: TimeSlot): string {
  switch (slot.kind) {
    case 'dynamic_test': {
      const d = slot as DynamicTestSlot;
      if (d.activityType === 'FIRST_GAP_RETENTION_TEST') return 'bg-gradient-to-r from-emerald-400 to-indigo-500';
      if (d.activityType === 'MICRO_DRILL') return 'bg-gradient-to-r from-purple-400 to-pink-500';
      return 'bg-gradient-to-r from-indigo-400 to-blue-500';
    }
    case 'study': {
      const s = slot as StudySlot;
      if (s.status === 'COMPLETED') return 'bg-emerald-300';
      if (s.tier === 'Critical')    return 'bg-red-400';
      if (s.tier === 'Developing')  return 'bg-amber-400';
      return 'bg-emerald-400';
    }
    case 'revision':    return 'bg-blue-400';
    case 'unavailable': return 'bg-slate-400';
    default:            return 'bg-transparent';
  }
}

function ariaLabel(slot: TimeSlot): string {
  if (slot.kind === 'dynamic_test') {
    const d = slot as DynamicTestSlot;
    return `${d.title} – ${d.subtitle}, ${d.startTime} to ${d.endTime}, ${d.durationMinutes} minutes. Press Enter to launch test.`;
  }
  if (slot.kind === 'study') {
    const s = slot as StudySlot;
    return `${s.subjectName} – ${s.chapterName}, ${s.startTime} to ${s.endTime}, ${s.tier}${s.hasBeenAssessed ? `, mastery ${Math.round(s.masteryScore)}%` : ', not yet assessed'}. Press Enter for details.`;
  }
  if (slot.kind === 'revision') {
    const r = slot as RevisionSlot;
    return `Revision: ${r.chapterName}, ${r.startTime} to ${r.endTime}. Press Enter for details.`;
  }
  if (slot.kind === 'unavailable') {
    const u = slot as UnavailableSlot;
    return `${u.label}, unavailable ${u.startTime} to ${u.endTime}.`;
  }
  return '';
}

/* ─────────────────────────────────────────────────────────────────────────────
   Floating detail panel
───────────────────────────────────────────────────────────────────────────── */

interface PanelProps {
  slot: StudySlot | RevisionSlot | UnavailableSlot | DynamicTestSlot;
  onClose: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onFocus?: () => void;
  onBlur?: (e: React.FocusEvent) => void;
  onStartDynamicTest?: (slot: DynamicTestSlot) => void;
}

const TooltipPanel = React.forwardRef<HTMLDivElement, PanelProps>(
  ({ slot, onClose, onMouseEnter, onMouseLeave, onFocus, onBlur, onStartDynamicTest }, ref) => {
    return (
      <>
        {/* Mobile backdrop */}
        <div
          className="fixed inset-0 z-40 sm:hidden bg-slate-950/50 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden="true"
        />

        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label="Time slot details"
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          onFocus={onFocus}
          onBlur={onBlur}
          className={[
            'fixed bottom-0 left-0 right-0 z-50',
            'sm:fixed sm:bottom-auto sm:left-auto sm:right-auto',
            'sm:absolute sm:top-0 sm:left-[calc(100%+10px)] sm:w-72',
            'bg-white dark:bg-slate-900',
            'border border-slate-200 dark:border-slate-700',
            'rounded-t-3xl sm:rounded-2xl shadow-2xl p-4 space-y-2.5',
            'max-h-[75vh] sm:max-h-[520px] overflow-y-auto',
            'pointer-events-auto',
            'z-[999]',
          ].join(' ')}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            aria-label="Close details panel"
          >
            <X size={13} />
          </button>

          {slot.kind === 'dynamic_test' && (
            <DynamicTestPanel
              slot={slot}
              onStart={() => {
                onClose();
                onStartDynamicTest?.(slot);
              }}
            />
          )}
          {slot.kind === 'unavailable' && <UnavailablePanel slot={slot} />}
          {slot.kind === 'revision'    && <RevisionPanel    slot={slot} />}
          {slot.kind === 'study'       && <StudyPanel       slot={slot} />}
        </div>
      </>
    );
  }
);
TooltipPanel.displayName = 'TooltipPanel';

function DynamicTestPanel({
  slot,
  onStart,
}: {
  slot: DynamicTestSlot;
  onStart: () => void;
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-2 pr-6">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              Smart Dynamic Revision
            </span>
          </div>
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-tight mt-0.5">
            {slot.title}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">{slot.subtitle}</p>
        </div>
      </div>

      <Row icon={<Clock size={12} />} label="Time Window">
        {slot.startTime} – {slot.endTime} ({slot.durationMinutes} min)
      </Row>

      <Row icon={<Brain size={12} className="text-indigo-500" />} label="Question Count">
        <span className="font-bold text-slate-800 dark:text-slate-200">
          {slot.questionCount} Questions
        </span>
      </Row>

      {slot.targetTopics && slot.targetTopics.length > 0 && (
        <div className="space-y-1 pt-1">
          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Target Topics</p>
          <div className="space-y-1">
            {slot.targetTopics.map((t, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between text-xs p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800"
              >
                <span className="font-semibold truncate text-slate-700 dark:text-slate-300">{t.chapterName}</span>
                <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">{Math.round(t.masteryScore)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Divider />

      <button
        onClick={onStart}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white font-bold text-xs shadow-md transition"
      >
        <Play size={13} fill="currentColor" />
        Start Active Recall Test
      </button>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Panel content variants
───────────────────────────────────────────────────────────────────────────── */

function UnavailablePanel({ slot }: { slot: UnavailableSlot }) {
  return (
    <>
      <div className="flex items-center gap-2 pr-6">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-slate-200 dark:bg-slate-700 text-sm shrink-0">🚫</div>
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Unavailable</p>
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{slot.label}</p>
        </div>
      </div>
      <Row icon={<Clock size={12} />} label="Time">{slot.startTime} – {slot.endTime}</Row>
      <Row icon={<HelpCircle size={12} />} label="What this means">
        No study is scheduled here. This is a normal commitment in your day.
      </Row>
    </>
  );
}

function RevisionPanel({ slot }: { slot: RevisionSlot }) {
  return (
    <>
      <div className="flex items-start justify-between gap-2 pr-6">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wider text-blue-500">Revision</p>
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-tight">{slot.chapterName}</p>
          <p className="text-xs text-slate-500">{slot.subjectName}</p>
        </div>
        <TierPill tier={slot.tier} />
      </div>
      <Row icon={<Clock size={12} />} label="Time">{slot.startTime} – {slot.endTime} ({slot.durationMinutes} min)</Row>
      <Row icon={<Target size={12} />} label="Mastery">
        {slot.hasBeenAssessed
          ? <MasteryDisplay score={slot.masteryScore} />
          : <span className="italic text-slate-400">Not assessed yet</span>}
      </Row>
      {slot.daysOverdue > 0 && (
        <Row icon={<Zap size={12} className="text-amber-500" />} label="Overdue">
          {slot.daysOverdue} day{slot.daysOverdue !== 1 ? 's' : ''} past due
        </Row>
      )}
      <Divider />
      <Row icon={<HelpCircle size={12} />} label="Why revision?">
        Scheduled for revision based on your review schedule.
      </Row>
      <Row icon={<BookOpen size={12} />} label="Today's activity">
        Quick revision — re-read key points and briefly test yourself.
      </Row>
    </>
  );
}

function StudyPanel({ slot }: { slot: StudySlot }) {
  const deficiency = slot.hasBeenAssessed ? slot.deficiency : null;
  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 pr-6">
        <div className="min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-wider text-indigo-500 dark:text-indigo-400 truncate">
            {slot.subjectName}
          </p>
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-tight">
            {slot.chapterName}
          </p>
        </div>
        <TierPill tier={slot.tier} />
      </div>

      <Row icon={<Clock size={12} />} label="Time">
        {slot.startTime} – {slot.endTime}
        <span className="ml-1 text-slate-400">({slot.allocatedMinutes} min)</span>
      </Row>

      {slot.currentStage && (
        <Row icon={<TrendingUp size={12} />} label="Current stage">
          <span className="font-semibold">{stageLabel(slot.currentStage)}</span>
        </Row>
      )}

      <Row icon={<Target size={12} />} label="Mastery">
        {slot.hasBeenAssessed
          ? <MasteryDisplay score={slot.masteryScore} />
          : <span className="italic text-slate-400">Not assessed yet</span>}
      </Row>

      {slot.hasBeenAssessed && deficiency !== null && (
        <Row icon={<AlertTriangle size={12} className="text-amber-500" />} label="Learning gap">
          <span className={deficiency > 50
            ? 'text-red-600 dark:text-red-400 font-semibold'
            : 'text-amber-600 dark:text-amber-400 font-semibold'}>
            {deficiency}% remaining to close
          </span>
        </Row>
      )}

      {slot.isCarriedForward && (
        <div className="px-2 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700/40 text-[10px] text-amber-700 dark:text-amber-300 font-medium">
          ⏩ Carried forward from yesterday
        </div>
      )}

      {slot.nextReviewDate && (
        <Row icon={<RefreshCw size={12} />} label="Next review">
          {slot.nextReviewDate}
        </Row>
      )}

      <Divider />

      <Row icon={<HelpCircle size={12} />} label="Why this chapter?">
        <span className="text-slate-600 dark:text-slate-300">{slot.whyExplanation}</span>
      </Row>

      <Row icon={<BookOpen size={12} />} label="Today's activity">
        <span className="text-slate-600 dark:text-slate-300">{slot.activityDescription}</span>
      </Row>

      {slot.status !== 'PENDING' && <StatusBadge status={slot.status} />}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Shared micro-components
───────────────────────────────────────────────────────────────────────────── */

function Row({
  icon, label, children,
}: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="shrink-0 mt-0.5 text-slate-400">{icon}</span>
      <div className="min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-0.5">
          {label}
        </p>
        <span className="text-xs text-slate-700 dark:text-slate-300 leading-snug">
          {children}
        </span>
      </div>
    </div>
  );
}

function Divider() {
  return <hr className="border-slate-100 dark:border-slate-800" />;
}

function MasteryDisplay({ score }: { score: number }) {
  const color = score < 50 ? 'text-red-600 dark:text-red-400' : score < 75 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400';
  const bar   = score < 50 ? 'bg-red-500' : score < 75 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <span className="flex items-center gap-2">
      <strong className={color}>{Math.round(score)}%</strong>
      <span className="inline-block w-16 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden align-middle">
        <span
          className={`block h-full rounded-full ${bar}`}
          style={{ width: `${Math.max(4, score)}%` }}
          role="progressbar"
          aria-valuenow={Math.round(score)}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </span>
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { text: string; cls: string }> = {
    COMPLETED:   { text: '✓ Completed',   cls: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700/40' },
    IN_PROGRESS: { text: '▶ In Progress', cls: 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700/40' },
    SKIPPED:     { text: '⏭ Skipped',     cls: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700' },
  };
  const b = map[status];
  if (!b) return null;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border ${b.cls}`}>
      {b.text}
    </span>
  );
}

function stageLabel(stage: string): string {
  const m: Record<string, string> = {
    CONCEPT_STUDY:        'Concept Study',
    PRACTICE_DRILL:       'Practice Drill',
    ACTIVE_RECALL:        'Active Recall',
    READY_FOR_ASSESSMENT: 'Ready to Assess',
    COMPLETED:            'Completed ✓',
  };
  return m[stage] ?? stage;
}
