/**
 * Utilities for tracking completed Dynamic Recall Tests, Micro-Drills, and Spaced Quizzes.
 * Persistently synced with MySQL database (xxed_dynamic_recall_completions) and localStorage.
 * Ensures completed tests disappear from the Daily Planner, Daily tab, and Time Management timeline,
 * and stay gone across logout, login, and page refreshes.
 */

import { AURASTUDY_V1_PREFIX } from '../config/api';


export function formatLocalDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getCompletedDynamicSlots(studentId: number, dateStr?: string): string[] {
  if (!studentId) return [];
  const targetDate = dateStr || formatLocalDate();
  const key = `aura_completed_dynamic_slots_${studentId}_${targetDate}`;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.warn('Failed to parse completed dynamic slots from localStorage:', err);
    return [];
  }
}

export async function fetchCompletedDynamicSlots(studentId: number, dateStr?: string): Promise<string[]> {
  if (!studentId) return [];
  const targetDate = dateStr || formatLocalDate();
  const key = `aura_completed_dynamic_slots_${studentId}_${targetDate}`;

  try {
    const res = await fetch(`${AURASTUDY_V1_PREFIX}/assessment/dynamic-recall/completed?user_id=${encodeURIComponent(String(studentId))}&completed_date=${encodeURIComponent(String(targetDate))}`);
    if (res.ok) {
      const data = await res.json();
      const serverSlots: string[] = data.completed_slot_ids || [];
      const localSlots = getCompletedDynamicSlots(studentId, targetDate);
      const merged = Array.from(new Set([...serverSlots, ...localSlots]));
      localStorage.setItem(key, JSON.stringify(merged));
      return merged;
    }
  } catch (err) {
    console.warn('Failed to fetch completed dynamic slots from backend API:', err);
  }

  return getCompletedDynamicSlots(studentId, targetDate);
}

export async function markDynamicSlotCompleted(
  studentId: number,
  slotId: string,
  dateStr?: string,
  extra?: {
    activityType?: string;
    accuracy?: number;
    obtainedMarks?: number;
    totalMarks?: number;
    timeTakenSeconds?: number;
  }
): Promise<void> {
  if (!studentId || !slotId) return;
  const targetDate = dateStr || formatLocalDate();
  const key = `aura_completed_dynamic_slots_${studentId}_${targetDate}`;

  // 1. Immediately update localStorage for instant UI reactivity
  try {
    const existing = getCompletedDynamicSlots(studentId, targetDate);
    if (!existing.includes(slotId)) {
      const updated = [...existing, slotId];
      localStorage.setItem(key, JSON.stringify(updated));
    }
  } catch (err) {
    console.warn('Failed to save completed dynamic slot to localStorage:', err);
  }

  // 2. Persist to MySQL database backend so it survives logouts, logins, and new devices
  try {
    await fetch(`${AURASTUDY_V1_PREFIX}/assessment/dynamic-recall/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id: studentId,
        slot_id: slotId,
        completed_date: targetDate,
        activity_type: extra?.activityType,
        accuracy: extra?.accuracy ?? 0.0,
        obtained_marks: extra?.obtainedMarks ?? 0.0,
        total_marks: extra?.totalMarks ?? 0.0,
        time_taken_seconds: extra?.timeTakenSeconds ?? 0,
      }),
    });
  } catch (err) {
    console.warn('Failed to record dynamic recall completion to backend API:', err);
  }
}

export function isDynamicSlotCompleted(studentId: number, slotId: string, dateStr?: string): boolean {
  const completed = getCompletedDynamicSlots(studentId, dateStr);
  return completed.includes(slotId);
}
