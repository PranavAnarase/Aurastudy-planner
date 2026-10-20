/**
 * TimeGrid — Visual grid of time-slot cards matching the reference sketch.
 *
 * Layout: CSS grid, 2 cols on mobile → 3 cols on tablet → 4 cols on desktop.
 * Each card is equal-height. Shaded/hatched cards = unavailable.
 * Hover/focus opens the full detail tooltip.
 */

import { Info, Brain } from 'lucide-react';
import TimeSlotBlock from './TimeSlotBlock';
import type { TimeSlot, DynamicTestSlot } from '../../types/dashboard';

interface TimeGridProps {
  slots: TimeSlot[];
  isLoading?: boolean;
  onStartDynamicTest?: (slot: DynamicTestSlot) => void;
}

export default function TimeGrid({ slots, isLoading, onStartDynamicTest }: TimeGridProps) {
  if (isLoading) return <TimeGridSkeleton />;

  if (slots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 bg-white/40 dark:bg-slate-900/20 text-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
          <Info size={22} className="text-slate-400" />
        </div>
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
          No study plan available for today.
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500 max-w-sm">
          A plan will appear here once today's schedule has been generated.
          Make sure your profile has a study start time set.
        </p>
      </div>
    );
  }

  const sorted = [...slots].sort((a, b) => a.startMinutes - b.startMinutes);

  return (
    <div className="space-y-4">
      {/* Legend */}
      <GridLegend />

      {/* THE GRID — matches sketch: equal cards in rows */}
      <div
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
        role="list"
        aria-label="Today's daily schedule"
      >
        {sorted.map((slot) => (
          <div key={slot.id} role="listitem">
            <TimeSlotBlock slot={slot} onStartDynamicTest={onStartDynamicTest} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Legend ─────────────────────────────────────────────────────────────────── */

function GridLegend() {
  return (
    <div
      className="flex flex-wrap gap-x-4 gap-y-2 px-1 items-center"
      aria-label="Schedule colour legend"
    >
      <LegendItem dot="bg-red-400"     label="Critical" />
      <LegendItem dot="bg-amber-400"   label="Developing" />
      <LegendItem dot="bg-emerald-400" label="Mastered" />
      <LegendItem dot="bg-blue-400"    label="Revision" />
      <LegendItem dot="bg-gradient-to-r from-emerald-400 to-indigo-500" label="Smart Revision" />
      <LegendItem dot="bg-slate-400"   label="Unavailable" hatch />
      <LegendItem dot="bg-slate-200 dark:bg-slate-700" label="Free" dashed />
    </div>
  );
}

function LegendItem({
  dot, label, hatch, dashed,
}: { dot: string; label: string; hatch?: boolean; dashed?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={[
          'w-3 h-3 rounded-sm shrink-0',
          hatch ? `${dot} opacity-60 legend-hatch` : '',
          dashed ? 'border border-dashed border-slate-300 dark:border-slate-600 bg-transparent' : '',
          !hatch && !dashed ? dot : '',
        ].join(' ')}
      />
      <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
        {label}
      </span>
    </div>
  );
}

/* ── Skeleton ────────────────────────────────────────────────────────────────── */

function TimeGridSkeleton() {
  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
      aria-busy="true"
      aria-label="Loading schedule…"
    >
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="h-32 rounded-2xl bg-slate-100 dark:bg-slate-800/60 animate-pulse"
          style={{ opacity: 1 - i * 0.07 }}
        />
      ))}
    </div>
  );
}
