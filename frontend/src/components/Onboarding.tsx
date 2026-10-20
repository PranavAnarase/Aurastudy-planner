import { useState } from 'react';
import { AURASTUDY_V1_PREFIX } from '../config/api';
import { Compass, Calendar, Star, LogIn, Users, UserCheck, HeartHandshake, Sparkles } from 'lucide-react';
import type { ParentAuthResponse } from '../types/parent';

interface OnboardingProps {
  onSuccess: (studentId: number, entryPoint: string, diagnosticCompleted?: boolean, sessionId?: number | null) => void;
  onParentSuccess?: (parentUser: ParentAuthResponse) => void;
}

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

export default function Onboarding({ onSuccess, onParentSuccess }: OnboardingProps) {
  const [role, setRole] = useState<'student' | 'parent'>('student');
  const [isLogin, setIsLogin] = useState(true);
  const [parentMode, setParentMode] = useState<'login' | 'register'>('login');
  
  const [formData, setFormData] = useState({
    board_id: 1,
    standard_id: 3,
    first_name: '',
    last_name: '',
    username: '',
    password: '',
    date_of_birth: '',
    school_name: '',
    medium: 'English',
    study_goal: 'EXAM_PREPARATION',
    daily_study_hours: 2.0,
    preferred_study_time: 'EVENING',
    preferred_study_start_time: '18:00', // Default start time for EVENING
    revision_preference: 'BOTH',
    academic_year_start_date: '2026-06-01',
    academic_year_end_date: '2027-04-30',
  });

  const [loginData, setLoginData] = useState({
    username: '',
    password: '',
  });

  // Parent Auth State
  const [parentFormData, setParentFormData] = useState({
    full_name: '',
    username: '',
    password: '',
    student_username: '',
  });

  const [parentLoginData, setParentLoginData] = useState({
    username: '',
    password: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        // Handle login lookup
        const response = await fetch(`${AURASTUDY_V1_PREFIX}/onboarding/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(loginData),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          if (errData.detail && Array.isArray(errData.detail)) {
            const msgs = errData.detail.map((err: any) => `${err.loc[err.loc.length - 1]}: ${err.msg}`).join(', ');
            throw new Error(msgs);
          }
          throw new Error(errData.detail || 'Login failed. Please check student credentials.');
        }

        const data = await response.json();
        onSuccess(data.student_id, data.entry_point, data.diagnostic_completed, data.session_id);
      } else {
        // Clean up optional fields so they don't send empty strings to date/string parsing
        const cleanedData = {
          ...formData,
          daily_study_hours: parseFloat(formData.daily_study_hours as any),
          date_of_birth: formData.date_of_birth || null,
          school_name: formData.school_name || null,
        };

        // Handle onboarding creation
        const response = await fetch(`${AURASTUDY_V1_PREFIX}/onboarding/student`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cleanedData),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          if (errData.detail && Array.isArray(errData.detail)) {
            const msgs = errData.detail.map((err: any) => `${err.loc[err.loc.length - 1]}: ${err.msg}`).join(', ');
            throw new Error(msgs);
          }
          throw new Error(errData.detail || 'Onboarding failed');
        }

        const data = await response.json();
        // New students have diagnosticCompleted = false
        onSuccess(data.student_id, data.entry_point, false, null);
      }
    } catch (err: any) {
      setError(err.message || 'Connection to backend failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleParentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (parentMode === 'login') {
        const response = await fetch(`${AURASTUDY_V1_PREFIX}/parent/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parentLoginData),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.detail || 'Invalid parent username or password.');
        }

        const data: ParentAuthResponse = await response.json();
        if (onParentSuccess) {
          onParentSuccess(data);
        }
      } else {
        // Parent Registration
        const response = await fetch(`${AURASTUDY_V1_PREFIX}/parent/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parentFormData),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.detail || 'Parent registration failed. Please check details.');
        }

        const data: ParentAuthResponse = await response.json();
        if (onParentSuccess) {
          onParentSuccess(data);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Parent service error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const updated = { ...prev, [name]: value };
      if (name === 'preferred_study_time') {
        if (value === 'MORNING') updated.preferred_study_start_time = '08:00';
        else if (value === 'AFTERNOON') updated.preferred_study_start_time = '14:00';
        else if (value === 'EVENING') updated.preferred_study_start_time = '18:00';
        else if (value === 'NIGHT') updated.preferred_study_start_time = '21:00';
      }
      return updated;
    });
  };

  const handleLoginChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setLoginData((prev) => ({ ...prev, [name]: value }));
  };

  const handleParentFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setParentFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleParentLoginChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setParentLoginData((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <div className="max-w-4xl mx-auto py-12 px-4">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-4xl md:text-5xl font-extrabold font-outfit tracking-tight bg-gradient-to-r from-violet-400 via-fuchsia-400 to-blue-400 bg-clip-text text-transparent">
          AuraStudy Portal
        </h1>
        <p className="text-slate-400 mt-2 text-base md:text-lg font-light">
          {role === 'student'
            ? (isLogin ? 'Enter credentials to load your personalized study planner' : 'Set up your profile to activate adaptive study scheduling')
            : 'Access read-only child learning telemetry and compassionate guidance'}
        </p>
      </div>

      {/* Role Selector Segmented Control */}
      <div className="flex justify-center mb-8">
        <div className="p-1.5 bg-slate-900/90 border border-slate-800 rounded-2xl flex items-center gap-2 shadow-xl backdrop-blur-md">
          <button
            type="button"
            onClick={() => {
              setRole('student');
              setError('');
            }}
            className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all duration-200 flex items-center gap-2 ${
              role === 'student'
                ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>🎓</span> Student Access
          </button>
          <button
            type="button"
            onClick={() => {
              setRole('parent');
              setError('');
            }}
            className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all duration-200 flex items-center gap-2 ${
              role === 'parent'
                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>👨‍👩‍👧</span> Parent Portal
          </button>
        </div>
      </div>

      {/* PARENT AUTH VIEW */}
      {role === 'parent' ? (
        <form onSubmit={handleParentSubmit} className="glass-dark rounded-3xl p-8 md:p-10 shadow-2xl glow-purple max-w-md mx-auto space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <h3 className="text-lg font-bold font-outfit text-pink-300 flex items-center gap-2">
              <HeartHandshake size={20} /> {parentMode === 'login' ? 'Parent Sign In' : 'Parent Registration'}
            </h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setParentMode('login');
                  setError('');
                }}
                className={`text-xs px-3 py-1 rounded-lg font-semibold transition ${
                  parentMode === 'login'
                    ? 'bg-pink-500/20 text-pink-300 border border-pink-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Log In
              </button>
              <button
                type="button"
                onClick={() => {
                  setParentMode('register');
                  setError('');
                }}
                className={`text-xs px-3 py-1 rounded-lg font-semibold transition ${
                  parentMode === 'register'
                    ? 'bg-pink-500/20 text-pink-300 border border-pink-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Register
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-500/50 text-red-200 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          {parentMode === 'login' ? (
            /* PARENT LOGIN */
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Parent Username</label>
                <input
                  type="text"
                  name="username"
                  required
                  placeholder="e.g. rajesh_p"
                  value={parentLoginData.username}
                  onChange={handleParentLoginChange}
                  className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-pink-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Password</label>
                <input
                  type="password"
                  name="password"
                  required
                  placeholder="Enter parent password"
                  value={parentLoginData.password}
                  onChange={handleParentLoginChange}
                  className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-pink-500 transition"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold rounded-2xl px-6 py-3.5 shadow-lg shadow-purple-900/30 hover:-translate-y-0.5 transition duration-150 disabled:opacity-50"
              >
                {loading ? 'Authenticating...' : 'Access Child Dashboard'}
              </button>
            </div>
          ) : (
            /* PARENT REGISTRATION (1 STEP) */
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Parent Full Name</label>
                <input
                  type="text"
                  name="full_name"
                  required
                  placeholder="e.g. Rajesh Anarase"
                  value={parentFormData.full_name}
                  onChange={handleParentFormChange}
                  className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-pink-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Choose Parent Username</label>
                <input
                  type="text"
                  name="username"
                  required
                  placeholder="e.g. rajesh_p"
                  value={parentFormData.username}
                  onChange={handleParentFormChange}
                  className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-pink-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Choose Password</label>
                <input
                  type="password"
                  name="password"
                  required
                  placeholder="Create a strong password"
                  value={parentFormData.password}
                  onChange={handleParentFormChange}
                  className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-pink-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> Child's Username (Existing Student)
                </label>
                <input
                  type="text"
                  name="student_username"
                  required
                  placeholder="e.g. pranav123"
                  value={parentFormData.student_username}
                  onChange={handleParentFormChange}
                  className="w-full bg-slate-900/50 border border-indigo-500/40 rounded-xl px-4 py-2.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-pink-500 transition"
                />
                <p className="text-[11px] text-slate-400 mt-1">Direct link to student profile without altering student records</p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold rounded-2xl px-6 py-3.5 shadow-lg shadow-purple-900/30 hover:-translate-y-0.5 transition duration-150 disabled:opacity-50"
              >
                {loading ? 'Linking & Creating Account...' : 'Complete Parent Sign Up'}
              </button>
            </div>
          )}
        </form>
      ) : (
        /* STUDENT AUTH VIEW (UNTOUCHED LOGIC) */
        <form onSubmit={handleStudentSubmit} className="glass-dark rounded-3xl p-8 md:p-10 shadow-2xl glow-purple space-y-8">
          {error && (
            <div className="bg-red-900/30 border border-red-500/50 text-red-200 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          {isLogin ? (
            /* STUDENT LOGIN MODE */
            <div className="space-y-6 max-w-md mx-auto py-4">
              <h3 className="text-xl font-bold font-outfit text-violet-300 flex items-center gap-2">
                <LogIn size={20} /> Student Login
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Username</label>
                  <input
                    type="text"
                    name="username"
                    required
                    placeholder="e.g. pranav123"
                    value={loginData.username}
                    onChange={handleLoginChange}
                    className="w-full bg-white/50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700/50 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-violet-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Password</label>
                  <input
                    type="password"
                    name="password"
                    required
                    placeholder="Enter your password"
                    value={loginData.password}
                    onChange={handleLoginChange}
                    className="w-full bg-white/50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700/50 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-violet-500 transition"
                  />
                </div>
              </div>

              <div className="pt-6 text-center space-y-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white font-semibold rounded-2xl px-12 py-4 shadow-lg hover:shadow-violet-900/40 hover:-translate-y-0.5 transition duration-150 disabled:opacity-50 disabled:pointer-events-none"
                >
                  {loading ? 'Logging in...' : 'Load Planner'}
                </button>
                
                <button
                  type="button"
                  onClick={() => setIsLogin(false)}
                  className="text-xs text-slate-400 hover:text-slate-200 underline block mx-auto transition"
                >
                  New student? Create an onboarding profile
                </button>
              </div>
            </div>
          ) : (
            /* STUDENT ONBOARDING MODE */
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Identity Section */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold font-outfit text-violet-300 flex items-center gap-2">
                    <Star size={18} /> Personal Identity
                  </h3>
                  
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">First Name</label>
                    <input
                      type="text"
                      name="first_name"
                      required
                      placeholder="e.g. Rahul"
                      value={formData.first_name}
                      onChange={handleChange}
                      className="w-full bg-white/50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700/50 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-violet-500 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Last Name</label>
                    <input
                      type="text"
                      name="last_name"
                      required
                      placeholder="e.g. Sharma"
                      value={formData.last_name}
                      onChange={handleChange}
                      className="w-full bg-white/50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700/50 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-violet-500 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Username</label>
                    <input
                      type="text"
                      name="username"
                      required
                      placeholder="e.g. rahul123"
                      value={formData.username}
                      onChange={handleChange}
                      className="w-full bg-white/50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700/50 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-violet-500 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Password</label>
                    <input
                      type="password"
                      name="password"
                      required
                      placeholder="Choose a password"
                      value={formData.password}
                      onChange={handleChange}
                      className="w-full bg-white/50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700/50 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-violet-500 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">School Name</label>
                    <input
                      type="text"
                      name="school_name"
                      placeholder="e.g. St. Xavier's High School"
                      value={formData.school_name}
                      onChange={handleChange}
                      className="w-full bg-white/50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700/50 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-violet-500 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Date of Birth</label>
                    <input
                      type="date"
                      name="date_of_birth"
                      value={formData.date_of_birth}
                      onChange={handleChange}
                      className="w-full bg-white/50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700/50 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-violet-500 transition"
                    />
                  </div>
                </div>

                {/* Academic Configuration */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold font-outfit text-fuchsia-300 flex items-center gap-2">
                    <Compass size={18} /> Academic Profile
                  </h3>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Standard (Class)</label>
                    <select
                      name="standard_id"
                      value={formData.standard_id}
                      onChange={handleChange}
                      className="w-full bg-white/50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700/50 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-fuchsia-500 transition"
                    >
                      <option value={1}>Standard 5</option>
                      <option value={2}>Standard 6</option>
                      <option value={3}>Standard 7</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Medium of Instruction</label>
                    <select
                      name="medium"
                      value={formData.medium}
                      onChange={handleChange}
                      className="w-full bg-white/50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700/50 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-fuchsia-500 transition"
                    >
                      <option value="English">English</option>
                      <option value="Marathi">Marathi</option>
                      <option value="Hindi">Hindi</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Primary Goal</label>
                    <select
                      name="study_goal"
                      value={formData.study_goal}
                      onChange={handleChange}
                      className="w-full bg-white/50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700/50 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-fuchsia-500 transition"
                    >
                      <option value="EXAM_PREPARATION">Exam Preparation</option>
                      <option value="SKILL_BUILDING">Skill Building</option>
                      <option value="GENERAL_LEARNING">General Learning</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Revision Preference</label>
                    <select
                      name="revision_preference"
                      value={formData.revision_preference}
                      onChange={handleChange}
                      className="w-full bg-white/50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700/50 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-fuchsia-500 transition"
                    >
                      <option value="DAILY">Daily (Spaced Repetition)</option>
                      <option value="WEEKLY">Weekly Consolidation</option>
                      <option value="BOTH">Both (Daily + Weekly)</option>
                    </select>
                  </div>

                  {/* Study Time Settings */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Preferred Slot</label>
                      <select
                        name="preferred_study_time"
                        value={formData.preferred_study_time}
                        onChange={handleChange}
                        className="w-full bg-white/50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700/50 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-fuchsia-500 transition"
                      >
                        <option value="MORNING">Morning (08:00 AM)</option>
                        <option value="AFTERNOON">Afternoon (02:00 PM)</option>
                        <option value="EVENING">Evening (06:00 PM)</option>
                        <option value="NIGHT">Night (09:00 PM)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Start Time</label>
                      <input
                        type="time"
                        name="preferred_study_start_time"
                        value={formData.preferred_study_start_time}
                        onChange={handleChange}
                        className="w-full bg-white/50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700/50 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-fuchsia-500 transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                      Daily Study Hours: {formData.daily_study_hours} hrs
                      {formData.preferred_study_start_time && (
                        <span className="text-violet-400 ml-2 font-mono">
                          (End: {calculateEndTime(formData.preferred_study_start_time, formData.daily_study_hours)})
                        </span>
                      )}
                    </label>
                    <input
                      type="range"
                      min="1.0"
                      max="6.0"
                      step="0.5"
                      name="daily_study_hours"
                      value={formData.daily_study_hours}
                      onChange={handleChange}
                      className="w-full accent-fuchsia-500"
                    />
                  </div>
                </div>
              </div>

              {/* Academic Year Dates */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-700/50 space-y-4">
                <h3 className="text-lg font-semibold font-outfit text-blue-300 flex items-center gap-2">
                  <Calendar size={18} /> Academic Year Settings
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Start Date</label>
                    <input
                      type="date"
                      name="academic_year_start_date"
                      required
                      value={formData.academic_year_start_date}
                      onChange={handleChange}
                      className="w-full bg-white/50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700/50 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-fuchsia-500 transition"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">End Date</label>
                    <input
                      type="date"
                      name="academic_year_end_date"
                      required
                      value={formData.academic_year_end_date}
                      onChange={handleChange}
                      className="w-full bg-white/50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700/50 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-fuchsia-500 transition"
                    />
                  </div>
                </div>
              </div>

              {/* Submit */}
              <div className="pt-6 text-center space-y-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white font-semibold rounded-2xl px-12 py-4 shadow-lg hover:shadow-violet-900/40 hover:-translate-y-0.5 transition duration-150 disabled:opacity-50 disabled:pointer-events-none"
                >
                  {loading ? 'Initializing Profile...' : 'Begin Onboarding'}
                </button>
                
                <button
                  type="button"
                  onClick={() => setIsLogin(true)}
                  className="text-xs text-slate-400 hover:text-slate-200 underline block mx-auto transition"
                >
                  Already onboarded? Sign in to load your workspace
                </button>
              </div>
            </>
          )}
        </form>
      )}
    </div>
  );
}
