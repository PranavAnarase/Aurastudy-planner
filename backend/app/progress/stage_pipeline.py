"""
StagePipelineEngine — Pure Logic & Content Provider.

Manages the 4-stage sequential chapter learning lifecycle:
1. CONCEPT_STUDY: Core definitions, formula sheet, key concept points.
2. PRACTICE_DRILL: Guided interactive practice questions with instant solutions.
3. ACTIVE_RECALL: High-yield flashcards and active retrieval prompts.
4. READY_FOR_ASSESSMENT (ASSESSMENT_PREP): Unlocks the formal chapter assessment.
"""

from typing import Dict, List, Any
import enum


class StageEnum(str, enum.Enum):
    CONCEPT_STUDY = "CONCEPT_STUDY"
    PRACTICE_DRILL = "PRACTICE_DRILL"
    ACTIVE_RECALL = "ACTIVE_RECALL"
    READY_FOR_ASSESSMENT = "READY_FOR_ASSESSMENT"
    COMPLETED = "COMPLETED"


STAGE_ORDER = [
    StageEnum.CONCEPT_STUDY,
    StageEnum.PRACTICE_DRILL,
    StageEnum.ACTIVE_RECALL,
    StageEnum.READY_FOR_ASSESSMENT,
    StageEnum.COMPLETED
]


class StagePipelineEngine:
    @staticmethod
    def get_next_stage(current_stage: str) -> str:
        try:
            curr = StageEnum(current_stage)
            idx = STAGE_ORDER.index(curr)
            if idx + 1 < len(STAGE_ORDER):
                return STAGE_ORDER[idx + 1].value
            return STAGE_ORDER[-1].value
        except Exception:
            return StageEnum.CONCEPT_STUDY.value

    @staticmethod
    def validate_transition(
        from_stage: str,
        to_stage: str,
        concept_completed: bool,
        practice_completed: bool,
        recall_completed: bool
    ) -> bool:
        """
        Validates sequential stage gating.
        - Cannot enter PRACTICE_DRILL without concept_completed
        - Cannot enter ACTIVE_RECALL without practice_completed
        - Cannot enter READY_FOR_ASSESSMENT without recall_completed
        """
        if to_stage == StageEnum.PRACTICE_DRILL.value and not concept_completed:
            return False
        if to_stage == StageEnum.ACTIVE_RECALL.value and not (concept_completed and practice_completed):
            return False
        if to_stage == StageEnum.READY_FOR_ASSESSMENT.value and not (concept_completed and practice_completed and recall_completed):
            return False
        return True

    @staticmethod
    def build_pedagogical_content_from_questions(
        subject_name: str,
        chapter_name: str,
        chapter_number: int,
        questions: List[Any]
    ) -> Dict[str, Any]:
        """
        Builds genuine curriculum learning content directly from real database questions.
        Eliminates all hardcoded generic template strings.
        """
        practice_questions = []
        flashcards = []
        concept_points = []

        # 1. Practice Drill (take 2-3 genuine MCQs from DB)
        for idx, q in enumerate(questions[:3]):
            options = []
            if getattr(q, 'option_a', None): options.append(f"A) {q.option_a}")
            if getattr(q, 'option_b', None): options.append(f"B) {q.option_b}")
            if getattr(q, 'option_c', None): options.append(f"C) {q.option_c}")
            if getattr(q, 'option_d', None): options.append(f"D) {q.option_d}")
            
            practice_questions.append({
                "id": idx + 1,
                "question": q.question_text,
                "options": options,
                "correct_option": getattr(q, 'correct_option', 'A'),
                "explanation": getattr(q, 'explanation', '') or f"Correct answer is option {getattr(q, 'correct_option', 'A')}."
            })

        # 2. Active Recall Flashcards (derived from real questions & explanations)
        for idx, q in enumerate(questions[3:6] if len(questions) > 3 else questions[:3]):
            corr = getattr(q, 'correct_option', 'A')
            corr_text = ""
            if corr == 'A' and getattr(q, 'option_a', None): corr_text = q.option_a
            elif corr == 'B' and getattr(q, 'option_b', None): corr_text = q.option_b
            elif corr == 'C' and getattr(q, 'option_c', None): corr_text = q.option_c
            elif corr == 'D' and getattr(q, 'option_d', None): corr_text = q.option_d

            flashcards.append({
                "id": idx + 1,
                "front": q.question_text,
                "back": f"{corr}: {corr_text}" if corr_text else (getattr(q, 'explanation', '') or "Key concept recall.")
            })

        # 3. Concept Study Notes (derived directly from real questions/explanations in this chapter)
        for q in questions[:4]:
            if getattr(q, 'explanation', None) and len(q.explanation.strip()) > 5:
                concept_points.append(q.explanation.strip())
            else:
                concept_points.append(f"{q.question_text.strip()}")

        from app.progress.study_playbooks import get_subject_playbook
        playbook = get_subject_playbook(subject_name)

        return {
            "subject_name": subject_name,
            "chapter_name": chapter_name,
            "chapter_number": chapter_number,
            "concepts": concept_points,
            "practice_questions": practice_questions,
            "flashcards": flashcards,
            "playbook": playbook
        }


