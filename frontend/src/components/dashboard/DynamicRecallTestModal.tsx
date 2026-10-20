import { useState, useEffect, useCallback } from 'react';
import {
  Sparkles, Clock, CheckCircle2, AlertTriangle, ArrowRight,
  Brain, X, Zap, Award, Target, RefreshCw
} from 'lucide-react';
import type { DynamicTestSlot } from '../../types/dashboard';
import type { QuestionBankItem, DynamicRecallQuestionsResponse } from '../../types/scheduler';
import { markDynamicSlotCompleted } from '../../utils/completedTests';
import { AURASTUDY_V1_PREFIX } from '../../config/api';


interface DynamicRecallTestModalProps {
  isOpen?: boolean;
  onClose: () => void;
  onComplete?: (slotId: string) => void;
  slot: DynamicTestSlot | null;
  studentId: number;
}

export default function DynamicRecallTestModal({
  isOpen = true,
  onClose,
  onComplete,
  slot,
  studentId,
}: DynamicRecallTestModalProps) {
  const [questions, setQuestions] = useState<QuestionBankItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [showExplanation, setShowExplanation] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  // Fetch real questions strictly from xxed_academic_question_tab via backend API
  const fetchQuestions = useCallback(async () => {
    if (!slot) return;
    setLoading(true);
    setError(null);
    setQuestions([]);
    setCurrentIndex(0);
    setSelectedAnswers({});
    setShowExplanation(false);
    setIsCompleted(false);

    try {
      const chapterIds = slot.targetTopics && slot.targetTopics.length > 0
        ? slot.targetTopics.map((t) => t.chapterId)
        : [1]; // fallback

      const res = await fetch(`${AURASTUDY_V1_PREFIX}/assessment/dynamic-recall-questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          chapter_ids: chapterIds,
          question_count: slot.questionCount || 8,
          activity_type: slot.activityType,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Unable to load questions from xxed_academic_question_tab.');
      }

      const data: DynamicRecallQuestionsResponse = await res.json();
      if (!data.questions || data.questions.length === 0) {
        throw new Error('No academic questions found for the targeted chapters.');
      }

      setQuestions(data.questions);
      setSecondsRemaining((slot.durationMinutes || 20) * 60);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch academic questions.');
    } finally {
      setLoading(false);
    }
  }, [slot, studentId]);

  useEffect(() => {
    if (isOpen && slot) {
      fetchQuestions();
    }
  }, [isOpen, slot, fetchQuestions]);

  // Score calculation
  let correctCount = 0;
  questions.forEach((q, idx) => {
    if (selectedAnswers[idx] === q.correct_index) {
      correctCount++;
    }
  });
  const totalQuestions = questions.length;
  const scorePercent = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

  // Handle test completion
  const triggerCompletion = useCallback(() => {
    if (!slot) return;
    setIsCompleted(true);
    let correct = 0;
    questions.forEach((q, idx) => {
      if (selectedAnswers[idx] === q.correct_index) {
        correct++;
      }
    });
    const total = questions.length;
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
    const timeTaken = Math.max(0, (slot.durationMinutes || 20) * 60 - secondsRemaining);

    markDynamicSlotCompleted(studentId, slot.id, undefined, {
      activityType: slot.activityType,
      accuracy,
      obtainedMarks: correct,
      totalMarks: total,
      timeTakenSeconds: timeTaken,
    });
    localStorage.setItem('aura_last_task_update', Date.now().toString());
    onComplete?.(slot.id);
  }, [slot, studentId, onComplete, questions, selectedAnswers, secondsRemaining]);

  // Timer countdown
  useEffect(() => {
    if (!isOpen || isCompleted || loading || error || secondsRemaining <= 0) return;
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          triggerCompletion();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, isCompleted, loading, error, secondsRemaining, triggerCompletion]);

  const handleSelectOption = (index: number) => {
    if (selectedAnswers[currentIndex] !== undefined) return;
    setSelectedAnswers((prev) => ({ ...prev, [currentIndex]: index }));
    setShowExplanation(true);
  };

  const handleNext = () => {
    setShowExplanation(false);
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      triggerCompletion();
    }
  };

  const formatTimer = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen || !slot) return null;

  const currentQ = questions[currentIndex];
  const answeredCount = Object.keys(selectedAnswers).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-500/30">
              <Brain size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 font-outfit">
                  {slot.title}
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  {slot.badgeLabel}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {slot.subtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {!loading && !error && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
                <Clock size={14} className="text-indigo-500" />
                {formatTimer(secondsRemaining)}
              </div>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              aria-label="Close modal"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="p-12 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center mx-auto animate-spin">
              <RefreshCw size={24} />
            </div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Loading questions from Question Bank (xxed_academic_question_tab)...
            </p>
            <p className="text-xs text-slate-400">
              Selecting verified curriculum questions with matching options
            </p>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center mx-auto">
              <AlertTriangle size={24} />
            </div>
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">
              {error}
            </p>
            <button
              onClick={fetchQuestions}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Active Question Body */}
        {!loading && !error && !isCompleted && currentQ && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Progress bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-semibold text-slate-500">
                <span>Question {currentIndex + 1} of {totalQuestions}</span>
                <span>{answeredCount} Answered</span>
              </div>
              <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${((currentIndex + 1) / totalQuestions) * 100}%` }}
                />
              </div>
            </div>

            {/* Chapter & Subject Tag */}
            <div className="flex flex-wrap gap-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <Target size={13} className="text-indigo-500" />
                {currentQ.chapter_name}
              </div>
              {currentQ.subject_name && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                  {currentQ.subject_name}
                </div>
              )}
              <div className="inline-flex items-center px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-500">
                {currentQ.difficulty}
              </div>
            </div>

            {/* Question Text from xxed_academic_question_tab */}
            <div className="p-4 rounded-2xl bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-100/80 dark:border-indigo-900/40">
              <p className="text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 leading-relaxed">
                {currentQ.question_text}
              </p>
            </div>

            {/* Options matched from option_a, option_b, option_c, option_d */}
            <div className="space-y-2.5">
              {currentQ.options.map((opt, oIdx) => {
                const isSelected = selectedAnswers[currentIndex] === oIdx;
                const isCorrect = currentQ.correct_index === oIdx;
                const showResult = selectedAnswers[currentIndex] !== undefined;

                let optClass = 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-600 text-slate-700 dark:text-slate-300';
                if (showResult) {
                  if (isCorrect) {
                    optClass = 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-800 dark:text-emerald-200 font-semibold';
                  } else if (isSelected) {
                    optClass = 'bg-red-50 dark:bg-red-950/40 border-red-500 text-red-800 dark:text-red-200';
                  } else {
                    optClass = 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-50';
                  }
                }

                return (
                  <button
                    key={oIdx}
                    disabled={showResult}
                    onClick={() => handleSelectOption(oIdx)}
                    className={`w-full text-left p-3.5 rounded-2xl border transition-all flex items-start gap-3 ${optClass}`}
                  >
                    <span className="w-6 h-6 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 border border-inherit">
                      {String.fromCharCode(65 + oIdx)}
                    </span>
                    <span className="text-xs sm:text-sm font-medium leading-normal flex-1">
                      {opt}
                    </span>
                    {showResult && isCorrect && (
                      <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                    )}
                    {showResult && isSelected && !isCorrect && (
                      <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Explanation box from xxed_academic_question_tab */}
            {showExplanation && currentQ.explanation && (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1.5 animate-fade-in">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
                  <Zap size={14} className="text-amber-500" />
                  Answer Explanation
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {currentQ.explanation}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Completed View */}
        {isCompleted && (
          <div className="p-8 text-center space-y-6 overflow-y-auto">
            <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 flex items-center justify-center mx-auto">
              <Award size={32} />
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-outfit">
                Active Recall Drill Complete!
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                All questions evaluated directly against the academic question bank.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 max-w-md mx-auto">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <p className="text-[10px] font-bold uppercase text-slate-400">Score</p>
                <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400">{scorePercent}%</p>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <p className="text-[10px] font-bold uppercase text-slate-400">Correct</p>
                <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{correctCount} / {totalQuestions}</p>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <p className="text-[10px] font-bold uppercase text-slate-400">Pacing</p>
                <p className="text-lg font-bold text-slate-700 dark:text-slate-300">{Math.round((slot.durationMinutes * 60 - secondsRemaining) / Math.max(1, totalQuestions))}s / Q</p>
              </div>
            </div>

            <div className="flex justify-center gap-3 pt-2">
              <button
                onClick={onClose}
                className="px-6 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition shadow-lg shadow-indigo-500/20"
              >
                Return to Dashboard
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        {!loading && !error && !isCompleted && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            <span className="text-xs font-semibold text-slate-400">
              {slot.activityType === 'FIRST_GAP_RETENTION_TEST' ? '70% Yesterday Consolidate • 30% Weak Points' : 'Speed Error Correction'}
            </span>

            <button
              onClick={handleNext}
              disabled={selectedAnswers[currentIndex] === undefined}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold transition shadow-md shadow-indigo-500/10"
            >
              <span>{currentIndex === totalQuestions - 1 ? 'Finish Drill' : 'Next Question'}</span>
              <ArrowRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
