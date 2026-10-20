/**
 * Standard 7 Subject-Wise Study & Practice Guide Checklists.
 * Statically mapped in-memory (No database migrations).
 */

export interface StagePlaybook {
  concept_study: string[];
  practice_drill: string[];
  active_recall: string[];
}

export const STUDY_PLAYBOOKS: Record<string, StagePlaybook> = {
  Mathematics: {
    concept_study: [
      'Read standard definitions & properties',
      'Study standard formulas & identities',
      'Review 2 step-by-step solved examples'
    ],
    practice_drill: [
      'Solve basic direct numericals',
      'Practice multi-step application problems',
      'Verify calculation units & intermediate steps'
    ],
    active_recall: [
      'Write key formulas from memory on a blank sheet',
      'Re-solve 1 missed problem without hints'
    ]
  },
  'General Science': {
    concept_study: [
      'Read key definitions & physical laws',
      'Study labeled diagrams & process flowcharts',
      'Identify cause-and-effect relationships'
    ],
    practice_drill: [
      'Solve conceptual reasoning questions',
      'Practice identifying functions from diagrams',
      'Work through scenario-based problems'
    ],
    active_recall: [
      'Draw and label the main diagram from memory',
      'Verbally explain 1 core concept in simple terms'
    ]
  },
  Geography: {
    concept_study: [
      'Study landform & climate definitions',
      'Read map symbols, legends, & scales',
      'Analyze geographic phenomena (e.g., tides, winds)'
    ],
    practice_drill: [
      'Practice map-reading & contour questions',
      'Solve reasoning items on spatial distribution',
      'Answer data interpretation questions'
    ],
    active_recall: [
      'Sketch contour patterns or simple map outlines',
      'List differences (e.g., Weather vs. Climate)'
    ]
  },
  'History & Civics': {
    concept_study: [
      'Read chronological sequence of events',
      'Identify key historical figures & terms',
      'Understand constitutional rights & governance'
    ],
    practice_drill: [
      'Solve source-based MCQs (material, written)',
      'Answer "Cause -> Impact" questions',
      'Practice role-of-institutions items'
    ],
    active_recall: [
      'Create a 3-bullet chronological timeline',
      'Summarize key administrative terms'
    ]
  },
  English: {
    concept_study: [
      'Read chapter text / poem theme & tone',
      'Note new vocabulary, synonyms, & antonyms',
      'Study specific grammar rules (tenses, nouns)'
    ],
    practice_drill: [
      'Solve grammar application exercises',
      'Practice sentence transformation & vocabulary',
      'Answer reading comprehension questions'
    ],
    active_recall: [
      'Write 3 sentences using newly learned idioms',
      'Draft a 2-minute oral summary of the passage'
    ]
  },
  Hindi: {
    concept_study: [
      'Read chapter text / poem theme & tone',
      'Note new vocabulary, synonyms, & antonyms',
      'Study specific grammar rules (tenses, nouns)'
    ],
    practice_drill: [
      'Solve grammar application exercises',
      'Practice sentence transformation & vocabulary',
      'Answer reading comprehension questions'
    ],
    active_recall: [
      'Write 3 sentences using newly learned idioms',
      'Draft a 2-minute oral summary of the passage'
    ]
  },
  Marathi: {
    concept_study: [
      'Read chapter text / poem theme & tone',
      'Note new vocabulary, synonyms, & antonyms',
      'Study specific grammar rules (tenses, nouns)'
    ],
    practice_drill: [
      'Solve grammar application exercises',
      'Practice sentence transformation & vocabulary',
      'Answer reading comprehension questions'
    ],
    active_recall: [
      'Write 3 sentences using newly learned idioms',
      'Draft a 2-minute oral summary of the passage'
    ]
  }
};

export function getSubjectPlaybook(subjectName: string): StagePlaybook {
  const subLower = (subjectName || '').toLowerCase();
  if (subLower.includes('math')) return STUDY_PLAYBOOKS['Mathematics'];
  if (subLower.includes('science') || subLower.includes('environmental studies part 1')) return STUDY_PLAYBOOKS['General Science'];
  if (subLower.includes('geography')) return STUDY_PLAYBOOKS['Geography'];
  if (subLower.includes('history') || subLower.includes('civics') || subLower.includes('environmental studies part 2')) return STUDY_PLAYBOOKS['History & Civics'];
  if (subLower.includes('hindi')) return STUDY_PLAYBOOKS['Hindi'];
  if (subLower.includes('marathi')) return STUDY_PLAYBOOKS['Marathi'];
  return STUDY_PLAYBOOKS['English'];
}
