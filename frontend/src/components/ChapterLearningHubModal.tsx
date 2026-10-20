import { useState, useEffect } from 'react';
import { BookOpen, CheckCircle2, Lock, Unlock, Award, ArrowRight, Sparkles, Brain, RotateCcw, X, ListChecks } from 'lucide-react';
import { getSubjectPlaybook } from '../constants/studyPlaybooks';
import { API_BASE_URL, AURASTUDY_V1_PREFIX } from '../config/api';

interface ChapterLearningHubModalProps {
  chapterId: number;
  chapterName: string;
  subjectName: string;
  studentId: number;
  onClose: () => void;
  onStartAssessment: (chapterId: number, chapterName: string, subjectName: string) => void;
  onStageUpdated?: () => void;
}

export default function ChapterLearningHubModal({
  chapterId,
  chapterName,
  subjectName,
  studentId,
  onClose,
  onStartAssessment,
  onStageUpdated
}: ChapterLearningHubModalProps) {
  const [pipelineData, setPipelineData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'concept' | 'practice' | 'recall' | 'assess'>('concept');
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const [revealedAnswers, setRevealedAnswers] = useState<Record<number, boolean>>({});
  const [flippedCards, setFlippedCards] = useState<Record<number, boolean>>({});
  const [submittingStage, setSubmittingStage] = useState(false);
  const [checkedPlaybookItems, setCheckedPlaybookItems] = useState<Record<string, boolean>>({});

  const toggleCheckItem = (key: string) => {
    setCheckedPlaybookItems(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const playbook = getSubjectPlaybook(subjectName);


  const fetchPipeline = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${AURASTUDY_V1_PREFIX}/assessment/chapter/pipeline?chapter_id=${encodeURIComponent(String(chapterId))}&user_id=${encodeURIComponent(String(studentId))}`);
      if (res.ok) {
        const data = await res.json();
        setPipelineData(data);
        const stage = data.pipeline_state?.current_stage;
        if (stage === 'PRACTICE_DRILL') setActiveTab('practice');
        else if (stage === 'ACTIVE_RECALL') setActiveTab('recall');
        else if (stage === 'READY_FOR_ASSESSMENT' || stage === 'COMPLETED') setActiveTab('assess');
        else setActiveTab('concept');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPipeline();
  }, [chapterId, studentId]);

  const advanceStage = async (completedStage: string, nextTab: 'practice' | 'recall' | 'assess') => {
    try {
      setSubmittingStage(true);
      const res = await fetch(`${AURASTUDY_V1_PREFIX}/assessment/stage/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          chapter_id: chapterId,
          completed_stage: completedStage
        })
      });
      if (res.ok) {
        const data = await res.json();
        setPipelineData((prev: any) => ({
          ...prev,
          pipeline_state: data.pipeline_state
        }));
        setActiveTab(nextTab);
        localStorage.setItem('aura_last_task_update', Date.now().toString());
        if (onStageUpdated) onStageUpdated();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingStage(false);
    }
  };

  if (loading || !pipelineData) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Loading Chapter Learning Pipeline...</p>
        </div>
      </div>
    );
  }

  const { pipeline_state, content } = pipelineData;
  const isConceptDone = pipeline_state?.concept_completed;
  const isPracticeDone = pipeline_state?.practice_completed;
  const isRecallDone = pipeline_state?.recall_completed;
  const isAssessUnlocked = pipeline_state?.assessment_unlocked || pipeline_state?.current_stage === 'COMPLETED';

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex justify-between items-start">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-black tracking-wider uppercase px-2.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                {subjectName}
              </span>
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                Chapter {pipelineData.chapter_number}
              </span>
            </div>
            <h2 className="text-xl font-bold font-outfit text-slate-900 dark:text-slate-100">{chapterName}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* 4-Stage Pedagogical Stepper */}
        <div className="px-6 py-4 bg-slate-100/60 dark:bg-slate-950/40 border-b border-slate-200 dark:border-slate-800">
          <div className="grid grid-cols-4 gap-2 text-center text-xs font-bold">
            <button
              onClick={() => setActiveTab('concept')}
              className={`p-2.5 rounded-xl transition flex items-center justify-center gap-1.5 ${
                activeTab === 'concept'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : isConceptDone
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50'
                  : 'bg-white dark:bg-slate-800 text-slate-500'
              }`}
            >
              {isConceptDone ? <CheckCircle2 size={14} /> : <BookOpen size={14} />}
              <span className="hidden sm:inline">1. Concept</span>
            </button>

            <button
              onClick={() => isConceptDone && setActiveTab('practice')}
              disabled={!isConceptDone}
              className={`p-2.5 rounded-xl transition flex items-center justify-center gap-1.5 ${
                activeTab === 'practice'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : isPracticeDone
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50'
                  : isConceptDone
                  ? 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  : 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-900 text-slate-400'
              }`}
            >
              {isPracticeDone ? <CheckCircle2 size={14} /> : !isConceptDone ? <Lock size={14} /> : <Sparkles size={14} />}
              <span className="hidden sm:inline">2. Practice</span>
            </button>

            <button
              onClick={() => isPracticeDone && setActiveTab('recall')}
              disabled={!isPracticeDone}
              className={`p-2.5 rounded-xl transition flex items-center justify-center gap-1.5 ${
                activeTab === 'recall'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : isRecallDone
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50'
                  : isPracticeDone
                  ? 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  : 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-900 text-slate-400'
              }`}
            >
              {isRecallDone ? <CheckCircle2 size={14} /> : !isPracticeDone ? <Lock size={14} /> : <Brain size={14} />}
              <span className="hidden sm:inline">3. Recall</span>
            </button>

            <button
              onClick={() => isAssessUnlocked && setActiveTab('assess')}
              disabled={!isAssessUnlocked}
              className={`p-2.5 rounded-xl transition flex items-center justify-center gap-1.5 ${
                activeTab === 'assess'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : isAssessUnlocked
                  ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50'
                  : 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-900 text-slate-400'
              }`}
            >
              {isAssessUnlocked ? <Unlock size={14} /> : <Lock size={14} />}
              <span className="hidden sm:inline">4. Assess</span>
            </button>
          </div>
        </div>

        {/* Tab Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          
          {/* TAB 1: CONCEPT STUDY */}
          {activeTab === 'concept' && (
            <div className="space-y-6 animate-in fade-in">
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <BookOpen className="text-indigo-600 dark:text-indigo-400" size={20} />
                  Stage 1: Core Concept Study
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Read and review the essential Standard 7 theoretical foundations before taking practice drills.
                </p>
              </div>

              {/* Subject Playbook Checklist for Concept Study */}
              <div className="p-4 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                  <ListChecks size={16} />
                  {subjectName} Study Guide Checklist
                </div>
                <div className="space-y-1.5">
                  {playbook.concept_study.map((item, i) => {
                    const key = `c_${i}`;
                    const isChecked = checkedPlaybookItems[key];
                    return (
                      <button
                        key={i}
                        onClick={() => toggleCheckItem(key)}
                        className={`w-full text-left text-xs p-2.5 rounded-xl border flex items-center gap-2.5 transition ${
                          isChecked
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 text-emerald-800 dark:text-emerald-200 line-through'
                            : 'bg-white dark:bg-slate-900 border-indigo-100 dark:border-indigo-900/50 text-slate-700 dark:text-slate-300 hover:border-indigo-300'
                        }`}
                      >
                        <CheckCircle2 size={14} className={isChecked ? 'text-emerald-500' : 'text-slate-400'} />
                        <span className="font-medium">{item}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3">
                {content.concepts?.map((bullet: string, idx: number) => (
                  <div key={idx} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <p className="text-sm text-slate-800 dark:text-slate-200 font-medium leading-relaxed">
                      {bullet}
                    </p>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end">
                <button
                  onClick={() => advanceStage('CONCEPT_STUDY', 'practice')}
                  disabled={submittingStage}
                  className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold flex items-center gap-2 transition shadow-md"
                >
                  {isConceptDone ? 'Proceed to Practice Drill' : 'Mark Concept Understood & Continue'}
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: PRACTICE DRILL */}
          {activeTab === 'practice' && (
            <div className="space-y-6 animate-in fade-in">
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Sparkles className="text-indigo-600 dark:text-indigo-400" size={20} />
                  Stage 2: Interactive Practice Drill
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Solve guided questions to reinforce your conceptual understanding before active recall.
                </p>
              </div>

              {/* Subject Playbook Checklist for Practice Drill */}
              <div className="p-4 rounded-2xl bg-amber-50/60 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                  <ListChecks size={16} />
                  {subjectName} Practice Drill Checklist
                </div>
                <div className="space-y-1.5">
                  {playbook.practice_drill.map((item, i) => {
                    const key = `p_${i}`;
                    const isChecked = checkedPlaybookItems[key];
                    return (
                      <button
                        key={i}
                        onClick={() => toggleCheckItem(key)}
                        className={`w-full text-left text-xs p-2.5 rounded-xl border flex items-center gap-2.5 transition ${
                          isChecked
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 text-emerald-800 dark:text-emerald-200 line-through'
                            : 'bg-white dark:bg-slate-900 border-amber-100 dark:border-amber-900/50 text-slate-700 dark:text-slate-300 hover:border-amber-300'
                        }`}
                      >
                        <CheckCircle2 size={14} className={isChecked ? 'text-emerald-500' : 'text-slate-400'} />
                        <span className="font-medium">{item}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4">
                {content.practice_questions?.map((q: any) => {
                  const selected = selectedAnswers[q.id];
                  const isRevealed = revealedAnswers[q.id];
                  return (
                    <div key={q.id} className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 space-y-3">
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {q.id}. {q.question}
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {q.options.map((opt: string) => {
                          const optKey = opt.charAt(0);
                          const isSelected = selected === optKey;
                          return (
                            <button
                              key={opt}
                              onClick={() => {
                                setSelectedAnswers(prev => ({ ...prev, [q.id]: optKey }));
                                setRevealedAnswers(prev => ({ ...prev, [q.id]: true }));
                              }}
                              className={`p-3 rounded-xl text-left text-xs font-semibold transition border ${
                                isSelected
                                  ? optKey === q.correct_option
                                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-400 text-emerald-800 dark:text-emerald-200'
                                    : 'bg-rose-50 dark:bg-rose-950/40 border-rose-400 text-rose-800 dark:text-rose-200'
                                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                              }`}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>

                      {isRevealed && (
                        <div className="p-3 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-800/40 text-xs text-indigo-900 dark:text-indigo-200">
                          <strong>Explanation: </strong> {q.explanation}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end">
                <button
                  onClick={() => advanceStage('PRACTICE_DRILL', 'recall')}
                  disabled={submittingStage}
                  className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold flex items-center gap-2 transition shadow-md"
                >
                  {isPracticeDone ? 'Proceed to Active Recall' : 'Complete Practice Drill & Continue'}
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: ACTIVE RECALL */}
          {activeTab === 'recall' && (
            <div className="space-y-6 animate-in fade-in">
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Brain className="text-indigo-600 dark:text-indigo-400" size={20} />
                  Stage 3: Active Recall Flashcards
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Click each card to reveal the underlying answers and test your cognitive retention.
                </p>
              </div>

              {/* Subject Playbook Checklist for Active Recall */}
              <div className="p-4 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-800 dark:text-indigo-300">
                  <ListChecks size={16} />
                  {subjectName} Active Recall Checklist
                </div>
                <div className="space-y-1.5">
                  {playbook.active_recall.map((item, i) => {
                    const key = `r_${i}`;
                    const isChecked = checkedPlaybookItems[key];
                    return (
                      <button
                        key={i}
                        onClick={() => toggleCheckItem(key)}
                        className={`w-full text-left text-xs p-2.5 rounded-xl border flex items-center gap-2.5 transition ${
                          isChecked
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 text-emerald-800 dark:text-emerald-200 line-through'
                            : 'bg-white dark:bg-slate-900 border-indigo-100 dark:border-indigo-900/50 text-slate-700 dark:text-slate-300 hover:border-indigo-300'
                        }`}
                      >
                        <CheckCircle2 size={14} className={isChecked ? 'text-emerald-500' : 'text-slate-400'} />
                        <span className="font-medium">{item}</span>
                      </button>
                    );
                  })}
                </div>
              </div>


              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {content.flashcards?.map((card: any) => {
                  const isFlipped = flippedCards[card.id];
                  return (
                    <div
                      key={card.id}
                      onClick={() => setFlippedCards(prev => ({ ...prev, [card.id]: !prev[card.id] }))}
                      className="p-5 rounded-2xl bg-gradient-to-br from-slate-50 to-indigo-50/30 dark:from-slate-800/80 dark:to-indigo-950/20 border border-slate-200 dark:border-slate-700 cursor-pointer hover:border-indigo-400 transition min-h-[140px] flex flex-col justify-between"
                    >
                      <div>
                        <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider block mb-1">
                          Card {card.id} • {isFlipped ? 'Answer' : 'Question Prompt (Tap to flip)'}
                        </span>
                        <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          {isFlipped ? card.back : card.front}
                        </p>
                      </div>
                      <div className="flex justify-end pt-2">
                        <RotateCcw size={14} className="text-slate-400" />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end">
                <button
                  onClick={() => advanceStage('ACTIVE_RECALL', 'assess')}
                  disabled={submittingStage}
                  className="px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold flex items-center gap-2 transition shadow-md"
                >
                  {isRecallDone ? 'Proceed to Assessment' : 'Complete Active Recall & Unlock Assessment 🔓'}
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: CHAPTER ASSESSMENT */}
          {activeTab === 'assess' && (
            <div className="space-y-6 animate-in fade-in text-center py-6">
              {isAssessUnlocked ? (
                <div className="max-w-md mx-auto space-y-4">
                  <div className="w-16 h-16 rounded-3xl bg-indigo-500/10 dark:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto shadow-sm">
                    <Award size={32} />
                  </div>
                  <h3 className="text-2xl font-bold font-outfit text-slate-900 dark:text-slate-100">
                    Ready for Internal Assessment!
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    You have cleared Concept Study, Practice Drill, and Active Recall. You are now fully prepared to take the Standard 7 Chapter Test.
                  </p>

                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 space-y-1">
                    <p>🎯 <strong>Passing Criteria:</strong> Scoring $\ge 50\%$ unlocks Chapter {pipelineData.chapter_number + 1}.</p>
                    <p>⏱️ <strong>Format:</strong> 10-15 standard questions (40% Easy, 40% Avg, 20% Diff).</p>
                  </div>

                  <button
                    onClick={() => {
                      onClose();
                      onStartAssessment(chapterId, chapterName, subjectName);
                    }}
                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-base shadow-xl shadow-indigo-500/25 transition transform active:scale-95 flex items-center justify-center gap-2"
                  >
                    <Award size={20} />
                    Start Standard 7 Assessment
                  </button>
                </div>
              ) : (
                <div className="max-w-md mx-auto space-y-4">
                  <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                    <Lock size={32} />
                  </div>
                  <h3 className="text-xl font-bold font-outfit text-slate-900 dark:text-slate-100">
                    Assessment Gated
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Complete Stages 1 (Concept), 2 (Practice), and 3 (Active Recall) to unlock this formal chapter test.
                  </p>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
