import { useState, useEffect } from 'react';
import { AURASTUDY_V1_PREFIX } from './config/api';
import Onboarding from './components/Onboarding';
import DiagnosticLanding from './components/DiagnosticLanding';
import Diagnostic from './components/Diagnostic';
import DiagnosticResults from './components/DiagnosticResults';
import Dashboard from './components/Dashboard';
import ParentDashboard from './components/ParentDashboard';
import type { ParentAuthResponse } from './types/parent';
import UnavailabilityManager, {
  loadUnavailabilityBlocks,
  format24hTo12hDisplay,
} from './components/dashboard/UnavailabilityManager';
import type { UnavailabilityBlock } from './types/dashboard';
import {
  GraduationCap,
  User,
  Settings,
  LogOut,
  X,
  Sun,
  Moon,
  Clock,
  Calendar,
  Sparkles,
  Repeat,
  Plus,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';


type FlowState = 'onboarding' | 'pre-diagnostic' | 'diagnostic' | 'results' | 'dashboard' | 'parent-dashboard';

// Helper to calculate end time string
function calculateEndTime(startTimeStr: string | undefined, hours: number): string {
  if (!startTimeStr) return '';
  const [hStr, mStr] = startTimeStr.split(':');
  let h = parseInt(hStr, 10);
  let m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return '';
  
  const totalMinutes = h * 60 + m + Math.round(hours * 60);
  const endH = Math.floor(totalMinutes / 60) % 24;
  const endM = totalMinutes % 60;
  
  const period = endH >= 12 ? 'PM' : 'AM';
  const displayH = endH % 12 === 0 ? 12 : endH % 12;
  const displayM = endM.toString().padStart(2, '0');
  return `${displayH}:${displayM} ${period}`;
}

// Helper to format 24h to 12h
function formatTime12h(time24: string | undefined): string {
  if (!time24) return '';
  const parts = time24.split(':');
  if (parts.length < 2) return time24;
  let h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return time24;
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  const displayM = m.toString().padStart(2, '0');
  return `${displayH}:${displayM} ${period}`;
}

export default function App() {
  const [studentId, setStudentId] = useState<number | null>(() => {
    const saved = sessionStorage.getItem('studentId');
    return saved ? parseInt(saved, 10) : null;
  });

  const [sessionId, setSessionId] = useState<number | null>(() => {
    const saved = sessionStorage.getItem('sessionId');
    return saved ? parseInt(saved, 10) : null;
  });

  const [entryPoint, setEntryPoint] = useState<string>(() => {
    return sessionStorage.getItem('entryPoint') || '';
  });

  const [parentUser, setParentUser] = useState<ParentAuthResponse | null>(() => {
    const saved = sessionStorage.getItem('parentUser');
    return saved ? JSON.parse(saved) : null;
  });

  const [flow, setFlow] = useState<FlowState>(() => {
    const savedParent = sessionStorage.getItem('parentUser');
    if (savedParent) {
      return 'parent-dashboard';
    }
    const savedStudent = sessionStorage.getItem('studentId');
    const savedSession = sessionStorage.getItem('sessionId');
    const savedDiagnosticCompleted = sessionStorage.getItem('diagnosticCompleted');
    
    if (savedStudent && savedSession && savedDiagnosticCompleted === 'true') {
      return 'dashboard';
    } else if (savedStudent) {
      return 'pre-diagnostic';
    }
    return 'onboarding';
  });

  const [testResults, setTestResults] = useState<any>(null);
  const [attemptedSubjects, setAttemptedSubjects] = useState<string[]>([]);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);

  // Profile management states
  const [profile, setProfile] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [profileVersion, setProfileVersion] = useState(0);
  const [unavailBlocks, setUnavailBlocks] = useState<UnavailabilityBlock[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<'view' | 'edit' | 'commitments' | null>(null);

  // Live Clock state for global navbar
  const [navTime, setNavTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNavTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Theme state
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    return (saved as 'light' | 'dark') || 'dark';
  });

  // Sync theme with HTML class
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [theme]);


  // Fetch student profile details and commitments automatically when studentId is resolved
  useEffect(() => {
    if (studentId) {
      const loadProfile = async () => {
        try {
          const response = await fetch(`${AURASTUDY_V1_PREFIX}/onboarding/student?user_id=${encodeURIComponent(String(studentId))}`);
          if (response.ok) {
            const data = await response.json();
            setProfile(data);
            setEditForm(data);
          } else if (response.status === 404) {
            // Student ID in sessionStorage is invalid/doesn't exist. Clear it and redirect to onboarding/login.
            console.warn(`Student ID ${studentId} not found in database (404). Resetting workspace.`);
            setStudentId(null);
            setSessionId(null);
            setFlow('onboarding');
            sessionStorage.removeItem('studentId');
            sessionStorage.removeItem('sessionId');
            sessionStorage.removeItem('diagnosticCompleted');
            sessionStorage.removeItem('entryPoint');
          } else {
            console.error(`Failed to load student profile details. Server returned status: ${response.status}`);
          }
        } catch (err) {
          console.error('Failed to load student profile details:', err);
        }
      };
      loadProfile();
      loadUnavailabilityBlocks(studentId).then(setUnavailBlocks);
    } else {
      setProfile(null);
      setEditForm({});
      setUnavailBlocks([]);
    }
  }, [studentId, profileVersion]);

  // Load attempted subjects
  useEffect(() => {
    if (studentId) {
      const loadAttemptedSubjects = async () => {
        try {
          const response = await fetch(`${AURASTUDY_V1_PREFIX}/diagnostic/attempted-subjects?user_id=${encodeURIComponent(String(studentId))}`);
          if (response.ok) {
            const data = await response.json();
            setAttemptedSubjects(data);
          }
        } catch (err) {
          console.error('Failed to load attempted subjects:', err);
        }
      };
      loadAttemptedSubjects();
    } else {
      setAttemptedSubjects([]);
    }
  }, [studentId, flow]);

  const handleOnboardingSuccess = (
    id: number, 
    ep: string, 
    diagnosticCompleted: boolean = false, 
    sessId: number | null = null
  ) => {
    setStudentId(id);
    setEntryPoint(ep);
    sessionStorage.setItem('studentId', id.toString());
    sessionStorage.setItem('entryPoint', ep);

    if (diagnosticCompleted && sessId !== null) {
      setSessionId(sessId);
      sessionStorage.setItem('sessionId', sessId.toString());
      sessionStorage.setItem('diagnosticCompleted', 'true');
      setFlow('dashboard');
    } else {
      sessionStorage.removeItem('sessionId');
      sessionStorage.removeItem('diagnosticCompleted');
      setSessionId(null);
      setFlow('pre-diagnostic');
    }
  };

  const handleDiagnosticComplete = (sessId: number, reportData?: any) => {
    setSessionId(sessId);
    sessionStorage.setItem('sessionId', sessId.toString());
    sessionStorage.setItem('diagnosticCompleted', 'true');

    if (reportData) {
      setTestResults(reportData);
      setFlow('results');
    } else {
      setFlow('dashboard');
    }
  };

  const handleResetSession = () => {
    sessionStorage.removeItem('studentId');
    sessionStorage.removeItem('sessionId');
    sessionStorage.removeItem('diagnosticCompleted');
    sessionStorage.removeItem('entryPoint');
    sessionStorage.removeItem('parentUser');
    setStudentId(null);
    setSessionId(null);
    setParentUser(null);
    setEntryPoint('');
    setTestResults(null);
    setFlow('onboarding');
  };

  const handleParentSuccess = (user: ParentAuthResponse) => {
    setParentUser(user);
    sessionStorage.setItem('parentUser', JSON.stringify(user));
    setFlow('parent-dashboard');
  };

  const handleParentLogout = () => {
    sessionStorage.removeItem('parentUser');
    setParentUser(null);
    setFlow('onboarding');
  };

  const handleUpdateProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(`${AURASTUDY_V1_PREFIX}/onboarding/student/${studentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: editForm.first_name,
          last_name: editForm.last_name,
          password: editForm.password,
          date_of_birth: editForm.date_of_birth || null,
          school_name: editForm.school_name || null,
          medium: editForm.medium,
          study_goal: editForm.study_goal,
          daily_study_hours: parseFloat(editForm.daily_study_hours),
          preferred_study_time: editForm.preferred_study_time,
          preferred_study_start_time: editForm.preferred_study_start_time || null,
          revision_preference: editForm.revision_preference,
          academic_year_start_date: editForm.academic_year_start_date,
          academic_year_end_date: editForm.academic_year_end_date,
        }),
      });

      if (!response.ok) throw new Error('Failed to save profile changes.');
      const data = await response.json();
      setProfile(data);
      setProfileVersion((prev) => prev + 1);
      setActiveModal(null);
    } catch (err: any) {
      alert(err.message || 'Failed to save profile changes.');
    }
  };

  if (flow === 'parent-dashboard' && parentUser) {
    return (
      <ParentDashboard
        parentUser={parentUser}
        onLogout={handleParentLogout}
        theme={theme}
        onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      />
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top Navbar */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/40 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-gradient-to-r from-violet-600 to-blue-600 p-2 rounded-xl shadow-md">
              <GraduationCap className="text-white" size={20} />
            </div>
            <span className="font-extrabold font-outfit text-xl tracking-tight text-slate-900 dark:text-slate-100">
              AuraStudy
            </span>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            {/* Live Clock Navbar Pill */}
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs font-mono font-bold text-slate-800 dark:text-slate-200 shadow-xs">
              <Clock size={13} className="text-violet-500 animate-pulse" />
              <span>{navTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}</span>
            </div>

            <div className="hidden sm:flex items-center gap-2 text-xs font-medium text-slate-500">
              {flow === 'onboarding' && <span className="text-violet-600 dark:text-violet-400">Onboarding Stage</span>}
              {flow === 'pre-diagnostic' && <span className="text-violet-600 dark:text-violet-400">Ready for Assessment</span>}
              {flow === 'diagnostic' && <span className="text-blue-600 dark:text-blue-400 animate-pulse">Diagnostic Stage</span>}
              {flow === 'results' && <span className="text-fuchsia-600 dark:text-fuchsia-400">Results Summary</span>}
              {flow === 'dashboard' && <span className="text-emerald-600 dark:text-emerald-400">Active Workspace</span>}
            </div>

            {/* Theme Toggle Button */}
            <button
              id="theme-toggle-btn"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-xl bg-white/60 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition duration-150"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? <Sun size={15} className="text-yellow-400" /> : <Moon size={15} className="text-indigo-400" />}
            </button>


            {/* Profile Dropdown */}
            {flow !== 'onboarding' && profile && (
              <div className="relative">
                <button
                  id="profile-dropdown-btn"
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center gap-2.5 bg-white/60 dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-850 hover:border-slate-350 dark:hover:border-slate-700 text-slate-700 dark:text-slate-200 text-xs px-3.5 py-2 rounded-xl transition duration-150"
                >
                  <div className="w-5 h-5 rounded-lg bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center font-extrabold text-[10px] text-white">
                    {profile.first_name[0].toUpperCase()}
                  </div>
                  <span className="font-bold">{profile.first_name} {profile.last_name}</span>
                </button>

                {dropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)}></div>
                    <div className="absolute right-0 mt-2 w-52 bg-white dark:bg-slate-950/95 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-1.5 z-20 backdrop-blur-lg animate-in fade-in slide-in-from-top-2 duration-150">
                      <button
                        onClick={() => {
                          setDropdownOpen(false);
                          setActiveModal('view');
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-950 dark:hover:text-white text-xs font-semibold flex items-center gap-2 transition"
                      >
                        <User size={14} className="text-violet-600 dark:text-violet-400" />
                        User Profile
                      </button>
                      <button
                        onClick={() => {
                          setDropdownOpen(false);
                          setActiveModal('edit');
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-950 dark:hover:text-white text-xs font-semibold flex items-center gap-2 transition"
                      >
                        <Settings size={14} className="text-blue-600 dark:text-blue-400" />
                        Edit Profile
                      </button>
                      <button
                        onClick={() => {
                          setDropdownOpen(false);
                          setActiveModal('commitments');
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-950 dark:hover:text-white text-xs font-semibold flex items-center gap-2 transition"
                      >
                        <Clock size={14} className="text-indigo-600 dark:text-indigo-400" />
                        My Commitments
                      </button>
                      <hr className="border-slate-100 dark:border-slate-900 my-1.5" />
                      <button
                        onClick={() => {
                          setDropdownOpen(false);
                          handleResetSession();
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 text-xs font-semibold flex items-center gap-2 transition"
                      >
                        <LogOut size={14} />
                        Log Out
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-grow">
        {flow === 'onboarding' && (
          <Onboarding
            onSuccess={handleOnboardingSuccess}
            onParentSuccess={handleParentSuccess}
          />
        )}
        {flow === 'pre-diagnostic' && (
          <DiagnosticLanding
            attemptedSubjects={attemptedSubjects}
            onStart={(subjects) => {
              setSelectedSubjects(subjects);
              setFlow('diagnostic');
            }}
            onBack={attemptedSubjects.length > 0 ? () => setFlow('dashboard') : undefined}
          />
        )}
        {flow === 'diagnostic' && studentId && (
          <Diagnostic
            studentId={studentId}
            entryPoint={entryPoint}
            selectedSubjects={selectedSubjects}
            onComplete={handleDiagnosticComplete}
          />
        )}
        {flow === 'results' && testResults && (
          <DiagnosticResults
            results={testResults}
            onProceed={() => setFlow('dashboard')}
          />
        )}
        {flow === 'dashboard' && studentId && sessionId && (
          <Dashboard
            studentId={studentId}
            sessionId={sessionId}
            profileVersion={profileVersion}
            studentName={profile?.first_name || profile?.name}
            attemptedSubjects={attemptedSubjects}
            onResumeDiagnostic={() => {
              sessionStorage.removeItem('diagnosticCompleted');
              setFlow('pre-diagnostic');
            }}
          />
        )}

      </main>

      {/* Profile & Commitments Modals */}
      {activeModal !== null && profile && studentId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
            {/* Modal Header with Navigation Tabs */}
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-violet-600 to-blue-600 flex items-center justify-center text-white shadow-sm font-bold text-xs">
                    {profile.first_name ? profile.first_name[0].toUpperCase() : 'S'}
                  </div>
                  <div>
                    <h3 className="text-base font-bold font-outfit text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      {profile.first_name} {profile.last_name}
                    </h3>
                    <p className="text-[11px] text-slate-500 font-mono">@{profile.username}</p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveModal(null)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  aria-label="Close modal"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Navigation Tabs */}
              <div className="flex items-center gap-1.5 p-1 bg-slate-200/80 dark:bg-slate-800/80 rounded-2xl">
                <button
                  type="button"
                  onClick={() => setActiveModal('view')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition ${
                    activeModal === 'view'
                      ? 'bg-white dark:bg-slate-900 text-violet-600 dark:text-violet-400 shadow-xs ring-1 ring-slate-200/50 dark:ring-slate-700/50'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <User size={14} />
                  User Profile
                </button>

                <button
                  type="button"
                  onClick={() => setActiveModal('edit')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition ${
                    activeModal === 'edit'
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs ring-1 ring-slate-200/50 dark:ring-slate-700/50'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <Settings size={14} />
                  Edit Profile
                </button>

                <button
                  type="button"
                  onClick={() => setActiveModal('commitments')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition ${
                    activeModal === 'commitments'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs ring-1 ring-slate-200/50 dark:ring-slate-700/50'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <Clock size={14} />
                  My Commitments
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-grow space-y-6">
              {activeModal === 'view' && (
                /* USER PROFILE VIEW */
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                    <div className="space-y-4 p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800/70">
                      <h4 className="text-xs uppercase font-bold tracking-wider text-violet-600 dark:text-violet-400 pb-1 border-b border-slate-200 dark:border-slate-700">
                        Personal Identity
                      </h4>
                      <div className="grid grid-cols-2 gap-y-2.5 text-xs">
                        <span className="text-slate-500 font-medium">Full Name:</span>
                        <span className="text-slate-800 dark:text-slate-200 font-bold">{profile.first_name} {profile.last_name}</span>
                        
                        <span className="text-slate-500 font-medium">Username:</span>
                        <span className="text-slate-800 dark:text-slate-200 font-mono">@{profile.username}</span>

                        <span className="text-slate-500 font-medium">Date of Birth:</span>
                        <span className="text-slate-800 dark:text-slate-200">{profile.date_of_birth ? new Date(profile.date_of_birth).toLocaleDateString() : 'Not provided'}</span>

                        <span className="text-slate-500 font-medium">School:</span>
                        <span className="text-slate-800 dark:text-slate-200">{profile.school_name || 'Not provided'}</span>
                      </div>
                    </div>

                    <div className="space-y-4 p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800/70">
                      <h4 className="text-xs uppercase font-bold tracking-wider text-blue-600 dark:text-blue-400 pb-1 border-b border-slate-200 dark:border-slate-700">
                        Planner Configuration
                      </h4>
                      <div className="grid grid-cols-2 gap-y-2.5 text-xs">
                        <span className="text-slate-500 font-medium">Daily Target:</span>
                        <span className="text-slate-800 dark:text-slate-200 font-semibold">{profile.daily_study_hours} hours</span>

                        <span className="text-slate-500 font-medium">Medium:</span>
                        <span className="text-slate-800 dark:text-slate-200">{profile.medium}</span>

                        <span className="text-slate-500 font-medium">Study Goal:</span>
                        <span className="text-slate-800 dark:text-slate-200">{profile.study_goal.replace('_', ' ')}</span>

                        <span className="text-slate-500 font-medium">Preferred Time:</span>
                        <span className="text-slate-800 dark:text-slate-200">{profile.preferred_study_time}</span>

                        <span className="text-slate-500 font-medium">Start Time:</span>
                        <span className="text-slate-800 dark:text-slate-200">{profile.preferred_study_start_time ? formatTime12h(profile.preferred_study_start_time) : 'Not set'}</span>

                        <span className="text-slate-500 font-medium">Calculated End:</span>
                        <span className="text-slate-800 dark:text-slate-200 font-bold text-violet-600 dark:text-violet-400">{profile.preferred_study_end_time ? formatTime12h(profile.preferred_study_end_time) : 'Not calculated'}</span>

                        <span className="text-slate-500 font-medium">Revision Model:</span>
                        <span className="text-slate-800 dark:text-slate-200">{profile.revision_preference}</span>
                      </div>
                    </div>

                    <div className="md:col-span-2 space-y-4 p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800/70">
                      <h4 className="text-xs uppercase font-bold tracking-wider text-fuchsia-600 dark:text-fuchsia-400 pb-1 border-b border-slate-200 dark:border-slate-700">
                        Academic Bounds
                      </h4>
                      <div className="grid grid-cols-2 gap-y-2.5 max-w-md text-xs">
                        <span className="text-slate-500 font-medium">Year Start Date:</span>
                        <span className="text-slate-800 dark:text-slate-200">{new Date(profile.academic_year_start_date).toLocaleDateString()}</span>

                        <span className="text-slate-500 font-medium">Year End Date:</span>
                        <span className="text-slate-800 dark:text-slate-200">{new Date(profile.academic_year_end_date).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Section Under User Profile: My Commitments */}
                  <div className="pt-2">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 font-outfit">
                          <Clock className="text-indigo-500" size={16} />
                          My Commitments (Unavailable Schedule)
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Manage your college, tuition, travel, and sports periods with 12-hour AM / PM scheduling.
                        </p>
                      </div>
                    </div>

                    <div className="mt-3">
                      <UnavailabilityManager
                        studentId={studentId}
                        blocks={unavailBlocks}
                        onChange={(updated) => {
                          setUnavailBlocks(updated);
                          setProfileVersion((v) => v + 1);
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeModal === 'edit' && (
                /* EDIT PROFILE VIEW */
                <div className="space-y-6">
                  <form onSubmit={handleUpdateProfileSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <h4 className="text-xs uppercase font-bold tracking-wider text-violet-400">Personal Info</h4>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">First Name</label>
                          <input
                            type="text"
                            required
                            value={editForm.first_name}
                            onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
                            className="w-full bg-white/50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-violet-500 transition"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Last Name</label>
                          <input
                            type="text"
                            required
                            value={editForm.last_name}
                            onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
                            className="w-full bg-white/50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-violet-500 transition"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Password</label>
                          <input
                            type="password"
                            required
                            value={editForm.password}
                            onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                            className="w-full bg-white/50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-violet-500 transition"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">School Name</label>
                          <input
                            type="text"
                            value={editForm.school_name || ''}
                            onChange={(e) => setEditForm({ ...editForm, school_name: e.target.value })}
                            className="w-full bg-white/50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-violet-500 transition"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Date of Birth</label>
                          <input
                            type="date"
                            value={editForm.date_of_birth || ''}
                            onChange={(e) => setEditForm({ ...editForm, date_of_birth: e.target.value })}
                            className="w-full bg-white/50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-violet-500 transition"
                          />
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h4 className="text-xs uppercase font-bold tracking-wider text-blue-400">Preferences</h4>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Daily Study Hours</label>
                          <input
                            type="number"
                            required
                            min="0.5"
                            max="12"
                            step="0.5"
                            value={editForm.daily_study_hours}
                            onChange={(e) => setEditForm({ ...editForm, daily_study_hours: e.target.value })}
                            className="w-full bg-white/50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500 transition"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Medium of Instruction</label>
                          <select
                            value={editForm.medium}
                            onChange={(e) => setEditForm({ ...editForm, medium: e.target.value })}
                            className="w-full bg-white/50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500 transition"
                          >
                            <option value="English">English</option>
                            <option value="Marathi">Marathi</option>
                            <option value="Hindi">Hindi</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Study Goal</label>
                          <select
                            value={editForm.study_goal}
                            onChange={(e) => setEditForm({ ...editForm, study_goal: e.target.value })}
                            className="w-full bg-white/50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500 transition"
                          >
                            <option value="EXAM_PREPARATION">Exam Preparation</option>
                            <option value="SKILL_BUILDING">Skill Building</option>
                            <option value="GENERAL_LEARNING">General Learning</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Preferred Study Time</label>
                          <select
                            value={editForm.preferred_study_time}
                            onChange={(e) => {
                              const val = e.target.value;
                              let startVal = editForm.preferred_study_start_time;
                              if (val === 'MORNING') startVal = '08:00';
                              else if (val === 'AFTERNOON') startVal = '14:00';
                              else if (val === 'EVENING') startVal = '18:00';
                              else if (val === 'NIGHT') startVal = '21:00';
                              setEditForm({ ...editForm, preferred_study_time: val, preferred_study_start_time: startVal });
                            }}
                            className="w-full bg-white/50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500 transition"
                          >
                            <option value="MORNING">Morning</option>
                            <option value="AFTERNOON">Afternoon</option>
                            <option value="EVENING">Evening</option>
                            <option value="NIGHT">Night</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Preferred Start Time</label>
                          <input
                            type="time"
                            required
                            value={editForm.preferred_study_start_time || '18:00'}
                            onChange={(e) => setEditForm({ ...editForm, preferred_study_start_time: e.target.value })}
                            className="w-full bg-white/50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500 transition"
                          />
                        </div>
                        <div className="flex flex-col justify-end">
                          <span className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Calculated End Time</span>
                          <div className="w-full bg-slate-100/50 dark:bg-slate-900/30 border border-dashed border-slate-300 dark:border-slate-850 rounded-xl px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 font-bold font-mono">
                            {calculateEndTime(editForm.preferred_study_start_time, editForm.daily_study_hours) || 'N/A'}
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Revision Preference</label>
                          <select
                            value={editForm.revision_preference}
                            onChange={(e) => setEditForm({ ...editForm, revision_preference: e.target.value })}
                            className="w-full bg-white/50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500 transition"
                          >
                            <option value="DAILY">Daily Revision Slots Only</option>
                            <option value="WEEKLY">Weekly Pack Revision Only</option>
                            <option value="BOTH">Both Daily & Weekly Revision</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800/80">
                      <h4 className="text-xs uppercase font-bold tracking-wider text-fuchsia-600 dark:text-fuchsia-400">Academic Year Dates</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Academic Year Start Date</label>
                          <input
                            type="date"
                            required
                            value={editForm.academic_year_start_date}
                            onChange={(e) => setEditForm({ ...editForm, academic_year_start_date: e.target.value })}
                            className="w-full bg-white/50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-fuchsia-500 transition"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Academic Year End Date</label>
                          <input
                            type="date"
                            required
                            value={editForm.academic_year_end_date}
                            onChange={(e) => setEditForm({ ...editForm, academic_year_end_date: e.target.value })}
                            className="w-full bg-white/50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-fuchsia-500 transition"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Banner to switch to My Commitments */}
                    <div className="p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <Clock size={18} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
                        <div>
                          <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                            Looking to schedule unavailable commitments?
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            Set up college, sports, tuition, or coaching hours with 12-hour AM/PM controls.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveModal('commitments')}
                        className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition shrink-0 flex items-center gap-1"
                      >
                        Manage Commitments
                        <ChevronRight size={13} />
                      </button>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveModal(null);
                          setEditForm(profile);
                        }}
                        className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 text-xs font-bold px-4 py-2 rounded-xl transition"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white text-xs font-bold px-5 py-2 rounded-xl shadow-lg hover:shadow-violet-950/40 transition"
                      >
                        Save Settings
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {activeModal === 'commitments' && (
                /* DEDICATED MY COMMITMENTS VIEW */
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400">
                        <Clock size={18} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 font-outfit">
                          Student Commitments & Unavailable Periods
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          These periods are protected in your study plan with 12-hour AM/PM time selection.
                        </p>
                      </div>
                    </div>
                  </div>

                  <UnavailabilityManager
                    studentId={studentId}
                    blocks={unavailBlocks}
                    onChange={(updated) => {
                      setUnavailBlocks(updated);
                      setProfileVersion((v) => v + 1);
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/20 py-6 text-center text-xs text-slate-600">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <p>© 2026 AuraStudy. EdTech Internship Prototype.</p>
          <div className="flex items-center gap-1.5 text-slate-500">
            <span>MySQL-Backed Adaptive Scheduler</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
