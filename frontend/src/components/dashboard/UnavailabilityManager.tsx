/**
 * UnavailabilityManager — lets a student/parent define and easily alter commitment blocks.
 *
 * Features:
 * - Direct 12-Hour selection with interactive AM / PM tabs for Start and End times
 *   (e.g., easily select "9:00 PM to 10:00 PM" or "9:00 AM to 5:00 PM").
 * - Clean unified commitment list with full Edit (pencil) & Delete support.
 * - Recurring day-of-week presets (Mon–Fri, Sat–Sun, All Days) and Specific Date scheduling.
 * - Permanent database persistence in xxed_user_profile_tab.
 */

import { useState } from 'react';
import { Plus, Trash2, Clock, X, Calendar, Repeat, Check, Edit2 } from 'lucide-react';
import type { UnavailabilityBlock, CommitmentType, RecurrenceType, DayOfWeek } from '../../types/dashboard';
import { AURASTUDY_V1_PREFIX } from '../../config/api';


const COMMITMENT_TYPES: CommitmentType[] = [
  'College',
  'Tuition',
  'Travel',
  'Sports/Activity',
  'Break',
  'Other',
];

const ALL_DAYS: { code: DayOfWeek; label: string; short: string }[] = [
  { code: 'MON', label: 'Monday', short: 'Mon' },
  { code: 'TUE', label: 'Tuesday', short: 'Tue' },
  { code: 'WED', label: 'Wednesday', short: 'Wed' },
  { code: 'THU', label: 'Thursday', short: 'Thu' },
  { code: 'FRI', label: 'Friday', short: 'Fri' },
  { code: 'SAT', label: 'Saturday', short: 'Sat' },
  { code: 'SUN', label: 'Sunday', short: 'Sun' },
];

const WEEKDAY_CODES: DayOfWeek[] = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
const WEEKEND_CODES: DayOfWeek[] = ['SAT', 'SUN'];

const STORAGE_KEY = (studentId: number) => `aura_unavailability_${studentId}`;

export interface Time12h {
  hour: number;   // 1 to 12
  minute: number; // 0 to 59
  period: 'AM' | 'PM';
}

export function parseTo12h(time24: string): Time12h {
  if (!time24) return { hour: 9, minute: 0, period: 'AM' };
  const [hStr, mStr] = time24.split(':');
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10) || 0;
  if (isNaN(h)) h = 9;
  const period: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return { hour: hour12, minute: m, period };
}

export function toMinutesFromMidnight(t: Time12h): number {
  let h24 = t.hour % 12;
  if (t.period === 'PM') h24 += 12;
  return h24 * 60 + t.minute;
}

export function to24hString(t: Time12h): string {
  let h24 = t.hour % 12;
  if (t.period === 'PM') h24 += 12;
  return `${h24.toString().padStart(2, '0')}:${t.minute.toString().padStart(2, '0')}`;
}

export function format12hDisplay(t: Time12h): string {
  return `${t.hour}:${t.minute.toString().padStart(2, '0')} ${t.period}`;
}

export function format24hTo12hDisplay(time24: string): string {
  return format12hDisplay(parseTo12h(time24));
}

const DAY_OF_WEEK_MAP: DayOfWeek[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export function filterBlocksForDate(blocks: UnavailabilityBlock[], targetDate: Date): UnavailabilityBlock[] {
  const dayCode = DAY_OF_WEEK_MAP[targetDate.getDay()];
  const targetIso = targetDate.toISOString().split('T')[0];

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

/**
 * Load commitments persistently from backend API with localStorage caching.
 */
export async function loadUnavailabilityBlocks(studentId: number): Promise<UnavailabilityBlock[]> {
  try {
    const res = await fetch(`${AURASTUDY_V1_PREFIX}/planner/commitments?user_id=${encodeURIComponent(String(studentId))}`);
    if (res.ok) {
      const data = await res.json();
      const serverBlocks: UnavailabilityBlock[] = (data.commitments || []).map((c: any) => ({
        id: c.id,
        label: c.label,
        recurrenceType: c.recurrence_type || c.recurrenceType || 'WEEKLY_RECURRING',
        daysOfWeek: c.days_of_week || c.daysOfWeek || ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
        specificDate: c.specific_date || c.specificDate || undefined,
        startTime: c.start_time || c.startTime,
        endTime: c.end_time || c.endTime,
        color: c.color,
      }));

      // If server had no data but client has legacy localStorage, migrate local to server
      if (serverBlocks.length === 0) {
        const rawLocal = localStorage.getItem(STORAGE_KEY(studentId));
        if (rawLocal) {
          const localBlocks = JSON.parse(rawLocal) as UnavailabilityBlock[];
          if (localBlocks.length > 0) {
            await saveUnavailabilityBlocks(studentId, localBlocks);
            return localBlocks;
          }
        }
      }

      localStorage.setItem(STORAGE_KEY(studentId), JSON.stringify(serverBlocks));
      return serverBlocks;
    }
  } catch (err) {
    console.warn('Backend commitments fetch failed, falling back to cache:', err);
  }

  // Fallback to localStorage cache
  try {
    const raw = localStorage.getItem(STORAGE_KEY(studentId));
    if (!raw) return [];
    return JSON.parse(raw) as UnavailabilityBlock[];
  } catch {
    return [];
  }
}

/**
 * Save commitments persistently to backend API and localStorage.
 */
export async function saveUnavailabilityBlocks(studentId: number, blocks: UnavailabilityBlock[]): Promise<void> {
  localStorage.setItem(STORAGE_KEY(studentId), JSON.stringify(blocks));

  try {
    const payload = {
      commitments: blocks.map((b) => ({
        id: b.id,
        label: b.label,
        recurrence_type: b.recurrenceType || 'WEEKLY_RECURRING',
        days_of_week: b.daysOfWeek || [],
        specific_date: b.specificDate || null,
        start_time: b.startTime,
        end_time: b.endTime,
        color: b.color || null,
      })),
    };

    await fetch(`${AURASTUDY_V1_PREFIX}/planner/commitments/${studentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('Failed to sync commitments to server:', err);
  }
}

interface UnavailabilityManagerProps {
  studentId: number;
  blocks: UnavailabilityBlock[];
  onChange: (blocks: UnavailabilityBlock[]) => void;
}

interface FormState {
  label: CommitmentType | string;
  recurrenceType: RecurrenceType;
  daysOfWeek: DayOfWeek[];
  specificDate: string;
  startTime12: Time12h;
  endTime12: Time12h;
}

const getTodayIso = () => new Date().toISOString().split('T')[0];

const DEFAULT_FORM: FormState = {
  label: 'College',
  recurrenceType: 'WEEKLY_RECURRING',
  daysOfWeek: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
  specificDate: getTodayIso(),
  startTime12: { hour: 9, minute: 0, period: 'AM' },
  endTime12: { hour: 1, minute: 0, period: 'PM' },
};

/**
 * Time selection component with clear Hour, Minute, and AM / PM selection tabs.
 */
function Time12hPickerWithTabs({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Time12h;
  onChange: (val: Time12h) => void;
}) {
  return (
    <div className="space-y-1.5 flex-1 min-w-[200px]">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
          {label}
        </label>
        <span className="text-xs font-mono font-black text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/80 px-2.5 py-0.5 rounded-lg border border-violet-200 dark:border-violet-800">
          {format12hDisplay(value)}
        </span>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-2xl p-2.5 shadow-xs space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Hour and Minute Selectors */}
          <div className="flex items-center gap-1.5">
            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-slate-400 uppercase">Hour</span>
              <select
                value={value.hour}
                onChange={(e) => onChange({ ...value, hour: parseInt(e.target.value, 10) })}
                className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm font-bold rounded-xl px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500 cursor-pointer"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>

            <span className="text-slate-400 font-black text-lg self-end pb-1">:</span>

            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-slate-400 uppercase">Minute</span>
              <select
                value={value.minute.toString().padStart(2, '0')}
                onChange={(e) => onChange({ ...value, minute: parseInt(e.target.value, 10) })}
                className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm font-bold rounded-xl px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500 cursor-pointer"
              >
                {['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* AM / PM Selection Tabs */}
          <div className="flex flex-col items-start sm:items-end">
            <span className="text-[9px] font-bold text-slate-400 uppercase mr-1">Period</span>
            <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-300 dark:border-slate-700 gap-1">
              <button
                type="button"
                onClick={() => onChange({ ...value, period: 'AM' })}
                className={`px-3 py-1.5 text-xs font-black rounded-lg transition ${
                  value.period === 'AM'
                    ? 'bg-amber-500 text-white shadow-sm ring-2 ring-amber-400/40'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                AM
              </button>
              <button
                type="button"
                onClick={() => onChange({ ...value, period: 'PM' })}
                className={`px-3 py-1.5 text-xs font-black rounded-lg transition ${
                  value.period === 'PM'
                    ? 'bg-violet-600 text-white shadow-sm ring-2 ring-violet-400/40'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                PM
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function UnavailabilityManager({
  studentId,
  blocks,
  onChange,
}: UnavailabilityManagerProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const openNewForm = () => {
    setEditingBlockId(null);
    setForm(DEFAULT_FORM);
    setFormError('');
    setFormOpen(true);
  };

  const openEditForm = (block: UnavailabilityBlock) => {
    setEditingBlockId(block.id);
    setForm({
      label: block.label,
      recurrenceType: block.recurrenceType || 'WEEKLY_RECURRING',
      daysOfWeek: block.daysOfWeek && block.daysOfWeek.length > 0 ? block.daysOfWeek : ['MON', 'TUE', 'WED', 'THU', 'FRI'],
      specificDate: block.specificDate || getTodayIso(),
      startTime12: parseTo12h(block.startTime),
      endTime12: parseTo12h(block.endTime),
    });
    setFormError('');
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingBlockId(null);
    setFormError('');
  };

  const toggleDay = (code: DayOfWeek) => {
    const current = form.daysOfWeek;
    if (current.includes(code)) {
      if (current.length === 1) {
        setFormError('Please select at least one day.');
        return;
      }
      setFormError('');
      setForm({ ...form, daysOfWeek: current.filter((d) => d !== code) });
    } else {
      setFormError('');
      setForm({ ...form, daysOfWeek: [...current, code] });
    }
  };

  const applyPreset = (preset: 'WEEKDAYS' | 'WEEKENDS' | 'ALL') => {
    setFormError('');
    if (preset === 'WEEKDAYS') {
      setForm({ ...form, recurrenceType: 'WEEKLY_RECURRING', daysOfWeek: [...WEEKDAY_CODES] });
    } else if (preset === 'WEEKENDS') {
      setForm({ ...form, recurrenceType: 'WEEKLY_RECURRING', daysOfWeek: [...WEEKEND_CODES] });
    } else {
      setForm({ ...form, recurrenceType: 'WEEKLY_RECURRING', daysOfWeek: ALL_DAYS.map((d) => d.code) });
    }
  };

  const handleSaveForm = async () => {
    setFormError('');
    if (!form.label.trim()) {
      setFormError('Please select or enter an activity reason.');
      return;
    }

    const startMins = toMinutesFromMidnight(form.startTime12);
    const endMins = toMinutesFromMidnight(form.endTime12);

    if (startMins >= endMins) {
      setFormError(`End time (${format12hDisplay(form.endTime12)}) must be after start time (${format12hDisplay(form.startTime12)}).`);
      return;
    }

    const start24 = to24hString(form.startTime12);
    const end24 = to24hString(form.endTime12);

    if (form.recurrenceType === 'WEEKLY_RECURRING' && form.daysOfWeek.length === 0) {
      setFormError('Please select at least one day of the week.');
      return;
    }

    if (form.recurrenceType === 'SPECIFIC_DATE' && !form.specificDate) {
      setFormError('Please choose a valid specific date.');
      return;
    }

    let updated: UnavailabilityBlock[];

    if (editingBlockId) {
      // Update existing block
      updated = blocks.map((b) => {
        if (b.id !== editingBlockId) return b;
        return {
          ...b,
          label: form.label as CommitmentType,
          recurrenceType: form.recurrenceType,
          daysOfWeek: form.recurrenceType === 'WEEKLY_RECURRING' ? form.daysOfWeek : [],
          specificDate: form.recurrenceType === 'SPECIFIC_DATE' ? form.specificDate : undefined,
          startTime: start24,
          endTime: end24,
        };
      });
    } else {
      // Create new block
      const newBlock: UnavailabilityBlock = {
        id: `comm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        label: form.label as CommitmentType,
        recurrenceType: form.recurrenceType,
        daysOfWeek: form.recurrenceType === 'WEEKLY_RECURRING' ? form.daysOfWeek : [],
        specificDate: form.recurrenceType === 'SPECIFIC_DATE' ? form.specificDate : undefined,
        startTime: start24,
        endTime: end24,
      };
      updated = [...blocks, newBlock];
    }

    updated.sort((a, b) => a.startTime.localeCompare(b.startTime));

    setIsSaving(true);
    await saveUnavailabilityBlocks(studentId, updated);
    setIsSaving(false);

    onChange(updated);
    closeForm();
  };

  const handleRemove = async (id: string) => {
    const updated = blocks.filter((b) => b.id !== id);
    if (editingBlockId === id) {
      closeForm();
    }
    setIsSaving(true);
    await saveUnavailabilityBlocks(studentId, updated);
    setIsSaving(false);
    onChange(updated);
  };

  return (
    <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 glass-dark shadow-sm dark:shadow-none overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800/60 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/60">
            <Clock size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                My Commitments
              </h3>
              {isSaving && (
                <span className="text-[10px] text-indigo-500 font-bold animate-pulse">
                  Saving...
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Set your unavailable periods with 12-hour AM / PM time selection
            </p>
          </div>
        </div>

        <button
          onClick={formOpen ? closeForm : openNewForm}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition shadow-sm"
          aria-label="Add or close commitment block"
        >
          {formOpen ? <X size={13} /> : <Plus size={13} />}
          {formOpen ? 'Cancel' : 'Add Commitment'}
        </button>
      </div>

      {/* 12-Hour Add / Edit Form with AM/PM Tabs */}
      {formOpen && (
        <div className="px-5 py-4 bg-slate-50/95 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800/60 space-y-4 animate-fadeIn">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
              {editingBlockId ? <Edit2 size={13} className="text-indigo-500" /> : <Plus size={13} className="text-indigo-500" />}
              {editingBlockId ? 'Alter Commitment (12-Hour AM/PM)' : 'New Commitment (12-Hour AM/PM)'}
            </p>
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-2 py-0.5 rounded-md border border-indigo-200 dark:border-indigo-800">
              {format12hDisplay(form.startTime12)} → {format12hDisplay(form.endTime12)}
            </span>
          </div>

          {/* Activity Type Selection */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
              Activity / Reason
            </label>
            <select
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 transition"
            >
              {COMMITMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* 12-Hour Start and End Time Pickers with AM and PM Tabs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
            <Time12hPickerWithTabs
              label="Start Time"
              value={form.startTime12}
              onChange={(startTime12) => setForm({ ...form, startTime12 })}
            />
            <Time12hPickerWithTabs
              label="End Time"
              value={form.endTime12}
              onChange={(endTime12) => setForm({ ...form, endTime12 })}
            />
          </div>

          {/* Schedule Mode Selector */}
          <div className="space-y-2.5 pt-2 border-t border-slate-200/70 dark:border-slate-700/70">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Schedule Recurrence & Days
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setForm({ ...form, recurrenceType: 'WEEKLY_RECURRING' })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
                  form.recurrenceType === 'WEEKLY_RECURRING'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:border-indigo-400'
                }`}
              >
                <Repeat size={12} />
                Weekly Recurring
              </button>

              <button
                type="button"
                onClick={() => setForm({ ...form, recurrenceType: 'SPECIFIC_DATE' })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
                  form.recurrenceType === 'SPECIFIC_DATE'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:border-indigo-400'
                }`}
              >
                <Calendar size={12} />
                Specific Date Only
              </button>

              {form.recurrenceType === 'WEEKLY_RECURRING' && (
                <div className="flex items-center gap-1.5 ml-auto text-[11px]">
                  <span className="text-slate-400 font-semibold">Presets:</span>
                  <button
                    type="button"
                    onClick={() => applyPreset('WEEKDAYS')}
                    className="px-2 py-1 rounded-lg bg-slate-200/90 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold hover:bg-indigo-100 dark:hover:bg-indigo-950 transition"
                  >
                    Mon–Fri
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('WEEKENDS')}
                    className="px-2 py-1 rounded-lg bg-slate-200/90 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold hover:bg-indigo-100 dark:hover:bg-indigo-950 transition"
                  >
                    Sat–Sun
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('ALL')}
                    className="px-2 py-1 rounded-lg bg-slate-200/90 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold hover:bg-indigo-100 dark:hover:bg-indigo-950 transition"
                  >
                    All Days
                  </button>
                </div>
              )}
            </div>

            {form.recurrenceType === 'WEEKLY_RECURRING' ? (
              <div className="pt-1">
                <div className="flex flex-wrap gap-1.5">
                  {ALL_DAYS.map((day) => {
                    const isSelected = form.daysOfWeek.includes(day.code);
                    return (
                      <button
                        key={day.code}
                        type="button"
                        onClick={() => toggleDay(day.code)}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
                          isSelected
                            ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-600 shadow-xs'
                            : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                        }`}
                      >
                        {isSelected && <Check size={11} className="text-indigo-600 dark:text-indigo-400" />}
                        {day.short}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="pt-1 max-w-xs">
                <input
                  type="date"
                  value={form.specificDate}
                  onChange={(e) => setForm({ ...form, specificDate: e.target.value })}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 transition font-semibold"
                />
              </div>
            )}
          </div>

          {formError && (
            <p className="text-xs text-red-600 dark:text-red-400 font-semibold">{formError}</p>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={handleSaveForm}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold transition shadow-sm"
            >
              {isSaving
                ? 'Saving...'
                : editingBlockId
                ? 'Update Commitment'
                : 'Save Commitment'}
            </button>
            <button
              onClick={closeForm}
              type="button"
              className="px-3 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-200 text-xs font-bold transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Unified Commitment List */}
      <div className="px-5 py-4">
        {blocks.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500 italic text-center py-6">
            No commitments added. All study slots will remain open.
          </p>
        ) : (
          <div className="space-y-2">
            {blocks.map((block) => {
              const recurrence = block.recurrenceType || 'WEEKLY_RECURRING';
              const days = block.daysOfWeek || [];
              let scheduleBadge = '';

              if (recurrence === 'SPECIFIC_DATE' && block.specificDate) {
                scheduleBadge = `📅 ${block.specificDate}`;
              } else if (days.length === 5 && WEEKDAY_CODES.every((d) => days.includes(d))) {
                scheduleBadge = '🔁 Mon–Fri (Weekdays)';
              } else if (days.length === 2 && WEEKEND_CODES.every((d) => days.includes(d))) {
                scheduleBadge = '🔁 Sat–Sun (Weekends)';
              } else if (days.length === 7 || days.length === 0) {
                scheduleBadge = '🔁 Every Day';
              } else {
                scheduleBadge = `🔁 ${days.join(', ')}`;
              }

              const isEditingThis = editingBlockId === block.id;

              return (
                <div
                  key={block.id}
                  className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-2xl transition border ${
                    isEditingThis
                      ? 'bg-indigo-50/90 dark:bg-indigo-950/50 border-indigo-400 dark:border-indigo-500 ring-2 ring-indigo-500/20 shadow-sm'
                      : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700/80 hover:border-indigo-300 dark:hover:border-indigo-600 shadow-xs'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-3 h-3 rounded-full bg-indigo-500 dark:bg-indigo-400 shrink-0"
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                          {block.label}
                        </p>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
                          {scheduleBadge}
                        </span>
                      </div>
                      <p className="text-xs font-black text-indigo-600 dark:text-indigo-300 font-mono mt-0.5">
                        {format24hTo12hDisplay(block.startTime)} – {format24hTo12hDisplay(block.endTime)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openEditForm(block)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition"
                      aria-label={`Edit ${block.label} commitment`}
                      title="Edit / Alter commitment"
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      onClick={() => handleRemove(block.id)}
                      disabled={isSaving}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition"
                      aria-label={`Remove ${block.label} commitment`}
                      title="Remove commitment"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
