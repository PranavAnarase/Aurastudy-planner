import { useState, useEffect, useRef } from 'react';
import { AURASTUDY_V1_PREFIX } from '../config/api';
import { 
  CheckCircle2, Clock, AlertTriangle, ArrowRight, ArrowLeft, 
  Sparkles, Award, BarChart3, RefreshCw, X, ChevronDown, ChevronUp, Zap
} from 'lucide-react';

interface QuestionItem {
  question_id: number;
  question_order: number;
  question_text: string;
  difficulty: 'Easy' | 'Average' | 'Difficult' | string;
  marks: number;
  estimated_seconds: number;
  option_a?: string;
  option_b?: string;
  option_c?: string;
  option_d?: string;
}

interface QuestionReviewItem {
  question_id: number;
  question_text: string;
  difficulty: string;
  selected_option: string | null;
  correct_option: string | null;
  is_correct: boolean;
  explanation: string | null;
  time_taken_seconds: number;
  ai_concept_gap?: string | null;
  ai_misconception_feedback?: string | null;
  ai_memory_tip?: string | null;
}

interface TimetableImpact {
  weekly_budget_hours: number;
  daily_study_hours: number;
  subject_masteries: Record<string, number>;
  deficiency_gaps: Record<string, number>;
  raw_weights: Record<string, number>;
  normalized_weights: Record<string, number>;
  allocated_hours: Record<string, number>;
  allocated_minutes: Record<string, number>;
}

interface AssessmentResultData {
  assessment_id: number;
  student_id: number;
  chapter_id: number;
  attempt_number: number;
  total_questions: number;
  obtained_marks: number;
  total_marks: number;
  accuracy: number;
  raw_score: number;
  ai_overall_summary?: string | null;
  mastery_update: {
    old_mastery: number | null;
    raw_score: number;
    updated_mastery: number;
    confidence: string;
    interval_days: number;
    next_review_date: string;
  };
  tier_actions: {
    tier: string;
    action_summary: string;
    recommendation: string;
    days_per_week: string;
    block_duration_minutes: number;
    unlock_next_chapter: boolean;
  };
  rebalanced_timetable: TimetableImpact;
  question_results: QuestionReviewItem[];
}


interface ChapterAssessmentModalProps {
  studentId: number;
  chapterId: number;
  chapterName?: string;
  subjectName?: string;
  isSpacedReview?: boolean;
  onClose: () => void;
  onAssessmentCompleted?: () => void;
}

export default function ChapterAssessmentModal({
  studentId,
  chapterId,
  chapterName = 'Chapter Assessment',
  subjectName = 'Standard 7 Academic Subject',
  isSpacedReview = false,
  onClose,
  onAssessmentCompleted
}: ChapterAssessmentModalProps) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  
  // Assessment metadata & questions
  const [assessmentId, setAssessmentId] = useState<number | null>(null);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  
  // User answers map: question_id -> selected_option
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const [timeSpent, setTimeSpent] = useState<Record<number, number>>({});
  
  // Per-question countdown timer (60 seconds)
  const [timerSeconds, setTimerSeconds] = useState(60);
  const questionStartTimeRef = useRef<number>(Date.now());

  // Results phase
  const [results, setResults] = useState<AssessmentResultData | null>(null);
  const [showReviewAccordion, setShowReviewAccordion] = useState(false);

  // Initialize Assessment Session
  useEffect(() => {
    async function startSession() {
      setLoading(true);
      setError('');
      try {
        const url = isSpacedReview 
          ? `${AURASTUDY_V1_PREFIX}/assessment/spaced-reviews/${chapterId}/start?student_id=${studentId}`
          : `${AURASTUDY_V1_PREFIX}/assessment/chapters/${chapterId}/start`;
        
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: isSpacedReview ? undefined : JSON.stringify({
            student_id: studentId,
            total_questions: 10
          })
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || 'Failed to start chapter assessment.');
        }

        const data = await res.json();
        setAssessmentId(data.assessment_id);
        setQuestions(data.questions || []);
        setCurrentIdx(0);
        setTimerSeconds(60);
        questionStartTimeRef.current = Date.now();
      } catch (err: any) {
        setError(err.message || 'Error connecting to assessment server.');
      } finally {
        setLoading(false);
      }
    }

    startSession();
  }, [chapterId, studentId, isSpacedReview]);

  // Per-question timer countdown
  useEffect(() => {
    if (loading || results || questions.length === 0) return;

    const interval = setInterval(() => {
      setTimerSeconds(prev => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [currentIdx, loading, results, questions.length]);

  // Handle switching questions & tracking time
  const handleNextQuestion = () => {
    const qId = questions[currentIdx]?.question_id;
    if (qId) {
      const elapsed = Math.round((Date.now() - questionStartTimeRef.current) / 1000);
      setTimeSpent(prev => ({ ...prev, [qId]: (prev[qId] || 0) + elapsed }));
    }
    if (currentIdx < questions.length - 1) {
      setCurrentIdx(currentIdx + 1);
      setTimerSeconds(60);
      questionStartTimeRef.current = Date.now();
    }
  };

  const handlePrevQuestion = () => {
    const qId = questions[currentIdx]?.question_id;
    if (qId) {
      const elapsed = Math.round((Date.now() - questionStartTimeRef.current) / 1000);
      setTimeSpent(prev => ({ ...prev, [qId]: (prev[qId] || 0) + elapsed }));
    }
    if (currentIdx > 0) {
      setCurrentIdx(currentIdx - 1);
      setTimerSeconds(60);
      questionStartTimeRef.current = Date.now();
    }
  };

  const handleSelectOption = (optionKey: string) => {
    const qId = questions[currentIdx]?.question_id;
    if (!qId) return;
    setSelectedAnswers(prev => ({
      ...prev,
      [qId]: optionKey
    }));
  };

  // Submit assessment payload
  const handleSubmitAssessment = async () => {
    if (!assessmentId) return;

    // Record last question time
    const qId = questions[currentIdx]?.question_id;
    let updatedTimeSpent = { ...timeSpent };
    if (qId) {
      const elapsed = Math.round((Date.now() - questionStartTimeRef.current) / 1000);
      updatedTimeSpent = {
        ...updatedTimeSpent,
        [qId]: (updatedTimeSpent[qId] || 0) + elapsed
      };
      setTimeSpent(updatedTimeSpent);
    }

    setSubmitting(true);
    setError('');

    try {
      const responsesPayload = questions.map(q => ({
        question_id: q.question_id,
        selected_option: selectedAnswers[q.question_id] || null,
        time_taken_seconds: updatedTimeSpent[q.question_id] || 0
      }));

      const submitUrl = isSpacedReview
        ? `${AURASTUDY_V1_PREFIX}/assessment/spaced-reviews/${assessmentId}/submit`
        : `${AURASTUDY_V1_PREFIX}/assessment/${assessmentId}/submit`;

      const res = await fetch(submitUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          responses: responsesPayload
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to grade assessment.');
      }

      const resData = await res.json();
      setResults(resData);
      localStorage.setItem('aura_last_task_update', Date.now().toString());
      window.dispatchEvent(new CustomEvent('assessment_completed'));
      if (onAssessmentCompleted) {
        onAssessmentCompleted();
      }
    } catch (err: any) {
      setError(err.message || 'Error grading responses.');
    } finally {
      setSubmitting(false);
    }
  };

  const currentQ = questions[currentIdx];
  const answeredCount = Object.keys(selectedAnswers).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-8 text-slate-100 flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              {isSpacedReview ? <Zap className="w-5 h-5" /> : <Award className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                {chapterName}
                {isSpacedReview && (
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    Spaced Recall Quiz
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">{subjectName} • Standard 7 Academic Question Bank</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content Body */}
        <div className="flex-1 p-6 overflow-y-auto">
          {loading && (
            <div className="py-20 flex flex-col items-center justify-center text-center">
              <RefreshCw className="w-10 h-10 text-indigo-400 animate-spin mb-4" />
              <p className="text-base font-medium text-slate-200">Assembling Standard 7 Internal Assessment...</p>
              <p className="text-xs text-slate-500 mt-1">Applying 40% Easy / 40% Average / 20% Difficult cognitive distribution</p>
            </div>
          )}

          {error && (
            <div className="p-4 mb-6 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-rose-400" />
              <div>
                <p className="font-semibold">Assessment Notice</p>
                <p className="text-xs mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {/* ACTIVE TEST VIEW */}
          {!loading && !results && currentQ && (
            <div className="space-y-6">
              {/* Question Progress & Timer Bar */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                <div className="flex items-center gap-3">
                  <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    Question {currentIdx + 1} of {questions.length}
                  </span>
                  <span className={`px-2.5 py-1 text-xs font-semibold rounded-lg border ${
                    currentQ.difficulty === 'Easy' 
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : currentQ.difficulty === 'Difficult'
                      ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  }`}>
                    {currentQ.difficulty} Level
                  </span>
                  <span className="text-xs text-slate-400 font-medium">
                    Marks: {currentQ.marks}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Clock className={`w-4 h-4 ${timerSeconds < 10 ? 'text-rose-400 animate-pulse' : 'text-slate-400'}`} />
                  <span className={`text-sm font-mono font-bold ${
                    timerSeconds < 10 ? 'text-rose-400' : 'text-slate-200'
                  }`}>
                    {timerSeconds}s
                  </span>
                </div>
              </div>

              {/* Question Text */}
              <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/60">
                <p className="text-base font-medium text-slate-100 leading-relaxed">
                  {currentQ.question_text}
                </p>
              </div>

              {/* MCQ Options A, B, C, D */}
              <div className="grid grid-cols-1 gap-3">
                {[
                  { key: 'A', text: currentQ.option_a },
                  { key: 'B', text: currentQ.option_b },
                  { key: 'C', text: currentQ.option_c },
                  { key: 'D', text: currentQ.option_d }
                ].filter(opt => opt.text).map(opt => {
                  const isSelected = selectedAnswers[currentQ.question_id] === opt.key;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => handleSelectOption(opt.key)}
                      className={`w-full text-left p-4 rounded-xl border transition-all flex items-start gap-3 ${
                        isSelected 
                          ? 'bg-indigo-600/20 border-indigo-500 text-indigo-100 shadow-md shadow-indigo-500/10 ring-1 ring-indigo-500/40' 
                          : 'bg-slate-800/30 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:border-slate-600'
                      }`}
                    >
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                        isSelected 
                          ? 'bg-indigo-500 text-white' 
                          : 'bg-slate-700/60 text-slate-400'
                      }`}>
                        {opt.key}
                      </span>
                      <span className="text-sm font-medium leading-relaxed">{opt.text}</span>
                    </button>
                  );
                })}
              </div>

              {/* Progress summary bar */}
              <div className="pt-2">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                  <span>Answered: {answeredCount} / {questions.length}</span>
                  <span>{Math.round((answeredCount / questions.length) * 100)}% Completed</span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-indigo-500 transition-all duration-300"
                    style={{ width: `${(answeredCount / questions.length) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* RESULTS VIEW */}
          {!loading && results && (
            <div className="space-y-6">
              
              {/* Hero Banner with Score & Accuracy */}
              <div className="p-6 rounded-2xl bg-gradient-to-br from-indigo-950/60 to-slate-900 border border-indigo-500/30">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-wider rounded-full border ${
                        results.tier_actions?.tier === 'Mastered'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : results.tier_actions?.tier === 'Critical'
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      }`}>
                        {results.tier_actions?.tier || 'Assessed'} Tier
                      </span>
                      <span className="text-xs text-slate-400 font-medium">Attempt #{results.attempt_number}</span>
                    </div>
                    <h3 className="text-xl font-black text-slate-100">Assessment Performance Summary</h3>
                    <p className="text-xs text-slate-300 mt-1 max-w-xl">
                      {results.tier_actions?.action_summary}
                    </p>
                  </div>

                  <div className="flex items-center gap-4 bg-slate-950/60 px-5 py-3 rounded-xl border border-slate-800">
                    <div className="text-center">
                      <p className="text-2xl font-black text-indigo-400">{results.raw_score}%</p>
                      <p className="text-[10px] uppercase font-bold text-slate-400">Raw Score</p>
                    </div>
                    <div className="w-px h-8 bg-slate-800" />
                    <div className="text-center">
                      <p className="text-2xl font-black text-emerald-400">{results.obtained_marks}/{results.total_marks}</p>
                      <p className="text-[10px] uppercase font-bold text-slate-400">Marks</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Groq AI Diagnostic Tutor Summary Card */}
              {results.ai_overall_summary && (
                <div className="p-4 rounded-xl bg-gradient-to-r from-purple-950/40 via-indigo-950/40 to-slate-900/60 border border-purple-500/30">
                  <div className="flex items-center gap-2 text-purple-300 mb-1.5">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    <h4 className="text-xs font-bold uppercase tracking-wider">AI Diagnostic Tutor Summary</h4>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      Personalized Feedback
                    </span>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed font-medium">
                    {results.ai_overall_summary}
                  </p>
                </div>
              )}

              {/* 40/60 EMA Mastery & Retention Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 40/60 EMA Blending Card */}
                <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800">
                  <div className="flex items-center gap-2 text-indigo-400 mb-2">
                    <Sparkles className="w-4 h-4" />
                    <h4 className="text-xs font-bold uppercase tracking-wider">Adaptive EMA Mastery (40/60 Blend)</h4>
                  </div>
                  <div className="flex items-center justify-between mb-2 text-sm">
                    <span className="text-slate-400">Previous Mastery:</span>
                    <span className="font-semibold text-slate-300">
                      {results.mastery_update?.old_mastery !== null ? `${results.mastery_update.old_mastery}%` : 'Baseline (None)'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mb-3 text-sm">
                    <span className="text-slate-400">Updated Blended Mastery:</span>
                    <span className="font-bold text-indigo-300 text-base">
                      {results.mastery_update?.updated_mastery}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500"
                      style={{ width: `${results.mastery_update?.updated_mastery}%` }}
                    />
                  </div>
                </div>

                {/* Spaced Retention Plan Card */}
                <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800">
                  <div className="flex items-center gap-2 text-amber-400 mb-2">
                    <Clock className="w-4 h-4" />
                    <h4 className="text-xs font-bold uppercase tracking-wider">Spaced Review & Retention</h4>
                  </div>
                  <div className="flex items-center justify-between mb-2 text-sm">
                    <span className="text-slate-400">Spaced Review Interval:</span>
                    <span className="font-semibold text-slate-200">{results.mastery_update?.interval_days} Days</span>
                  </div>
                  <div className="flex items-center justify-between mb-2 text-sm">
                    <span className="text-slate-400">Next Review Due Date:</span>
                    <span className="font-semibold text-amber-300">{results.mastery_update?.next_review_date}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Weekly Schedule Load:</span>
                    <span className="font-semibold text-slate-200">
                      {results.tier_actions?.days_per_week} days/wk ({results.tier_actions?.block_duration_minutes} min blocks)
                    </span>
                  </div>
                </div>
              </div>

              {/* Dynamic Timetable Rebalancing Impact Card */}
              {results.rebalanced_timetable && (
                <div className="p-5 rounded-xl bg-slate-800/50 border border-slate-700/60">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-emerald-400">
                      <BarChart3 className="w-4 h-4" />
                      <h4 className="text-xs font-bold uppercase tracking-wider">Dynamic Deficiency-Driven Timetable Impact</h4>
                    </div>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Budget T = {results.rebalanced_timetable.weekly_budget_hours} hrs/week ({results.rebalanced_timetable.daily_study_hours}h/day)
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 pt-2">
                    {Object.entries(results.rebalanced_timetable.allocated_hours || {}).map(([subj, hours]) => (
                      <div key={subj} className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 text-center">
                        <p className="text-[11px] font-semibold text-slate-300 truncate" title={subj}>{subj}</p>
                        <p className="text-base font-black text-indigo-300 mt-1">{hours}h</p>
                        <p className="text-[10px] text-slate-400 font-mono">
                          {results.rebalanced_timetable.allocated_minutes?.[subj]}m
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Question Review Accordion with AI Tutor Diagnoses */}
              {results.question_results && results.question_results.length > 0 && (
                <div className="rounded-xl border border-slate-800 overflow-hidden">
                  <button
                    onClick={() => setShowReviewAccordion(!showReviewAccordion)}
                    className="w-full p-4 bg-slate-800/40 hover:bg-slate-800/60 flex items-center justify-between text-sm font-bold text-slate-200 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-indigo-400" />
                      <span>Detailed Answer Key & AI Tutor Explanations ({results.question_results.length} questions)</span>
                    </div>
                    {showReviewAccordion ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {showReviewAccordion && (
                    <div className="p-4 space-y-3 bg-slate-900/60 border-t border-slate-800">
                      {results.question_results.map((qr, idx) => (
                        <div key={qr.question_id} className={`p-4 rounded-xl border text-xs space-y-2.5 ${
                          qr.is_correct 
                            ? 'bg-emerald-950/20 border-emerald-500/20' 
                            : 'bg-rose-950/20 border-rose-500/20'
                        }`}>
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-200 text-sm">Q{idx + 1}. {qr.question_text}</span>
                            <span className={`px-2 py-0.5 rounded font-bold ${
                              qr.is_correct ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                            }`}>
                              {qr.is_correct ? 'Correct' : 'Incorrect'}
                            </span>
                          </div>

                          <div className="flex items-center gap-4 text-slate-300 pt-1">
                            <span>Your Answer: <strong className={qr.is_correct ? 'text-emerald-400' : 'text-rose-400'}>{qr.selected_option || 'None'}</strong></span>
                            <span>Correct Option: <strong className="text-emerald-400">{qr.correct_option}</strong></span>
                            <span>Time: {qr.time_taken_seconds}s</span>
                          </div>

                          {/* AI Concept Gap Focus */}
                          {qr.ai_concept_gap && (
                            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-[11px] font-bold text-indigo-300 shadow-sm">
                              <span>🎯 Micro-Concept Gap:</span>
                              <span className="text-white font-medium">{qr.ai_concept_gap}</span>
                            </div>
                          )}

                          {/* AI Contrastive Misconception Feedback */}
                          {qr.ai_misconception_feedback && (
                            <div className="text-slate-100 bg-slate-950/70 p-3.5 rounded-xl border border-indigo-500/20 text-xs leading-relaxed">
                              <div className="flex items-center gap-1.5 font-bold text-indigo-300 mb-1.5">
                                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                                <span>Contrastive Tutor Breakdown:</span>
                              </div>
                              <p className="text-slate-200 font-normal">{qr.ai_misconception_feedback}</p>
                            </div>
                          )}

                          {/* AI Memory Formula & Hook */}
                          {qr.ai_memory_tip && (
                            <div className="text-amber-200 bg-amber-950/30 p-3 rounded-xl border border-amber-500/30 text-xs leading-relaxed flex items-start gap-2.5 shadow-sm">
                              <Zap className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                              <div>
                                <span className="font-bold text-amber-300">Memory Formula & Hook: </span>
                                <span className="text-amber-100">{qr.ai_memory_tip}</span>
                              </div>
                            </div>
                          )}


                          {/* Standard Syllabus Explanation if distinct */}
                          {qr.explanation && (!qr.ai_misconception_feedback || !qr.ai_misconception_feedback.includes(qr.explanation)) && (
                            <p className="text-slate-400 italic bg-slate-950/30 p-2.5 rounded border border-slate-800/40">
                              💡 Syllabus Note: {qr.explanation}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}


            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-900/90 sticky bottom-0 z-20">
          {!results ? (
            <>
              <button
                onClick={handlePrevQuestion}
                disabled={currentIdx === 0 || loading || submitting}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> Previous
              </button>

              <div className="flex items-center gap-2">
                {currentIdx < questions.length - 1 ? (
                  <button
                    onClick={handleNextQuestion}
                    disabled={loading || submitting}
                    className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/20"
                  >
                    Next <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={handleSubmitAssessment}
                    disabled={loading || submitting}
                    className="flex items-center gap-1.5 px-6 py-2 text-xs font-black rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-500 hover:to-teal-500 transition-all shadow-lg shadow-emerald-600/25"
                  >
                    {submitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" /> Grading & Rebalancing...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" /> Submit & Rebalance
                      </>
                    )}
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="w-full flex items-center justify-end">
              <button
                onClick={onClose}
                className="flex items-center gap-2 px-6 py-2.5 text-xs font-black rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-600/20"
              >
                Apply Rebalanced Timetable & Return <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
