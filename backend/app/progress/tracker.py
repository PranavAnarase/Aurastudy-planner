"""
ProgressTracker — Orchestrator class.

Combines EMA, SM-2, and PriorityQueue to record session scores and retrieve
due chapters in priority order.
"""

from datetime import date
from typing import Dict, Tuple, Any

from .ema import compute_ema_mastery
from .sm2 import calculate_sm2
from .priority_queue import PriorityQueue
from .repository import ProgressRepository


class ProgressTracker:
    def __init__(self, repo: ProgressRepository):
        self.repo = repo

    async def record_session_result(
        self,
        student_id: int,
        chapter_id: int,
        score: float,
        today: date | None = None
    ) -> Tuple[float, int, float, int, date]:
        """
        Records the score of a study/quiz session:
        1. Blends the score with previous mastery using EMA (alpha=0.45).
        2. Updates Spaced Repetition (SM-2) intervals and next review date.
        3. Saves the updated state back to the database.
        """
        if today is None:
            today = date.today()

        # Load existing mastery
        mastery_record = await self.repo.get_chapter_mastery(student_id, chapter_id)

        old_mastery = None
        prev_interval = 1
        ease_factor = 2.5
        repetitions = 0

        if mastery_record:
            old_mastery = float(mastery_record.mastery_score)
            prev_interval = mastery_record.interval_days
            ease_factor = float(mastery_record.ease_factor)
            repetitions = mastery_record.repetitions

        # 1. EMA blending
        new_mastery = compute_ema_mastery(score, old_mastery)

        # 2. SM-2 spaced repetition calculation
        interval, new_ef, new_rep, next_review = calculate_sm2(
            accuracy=score,
            previous_interval=prev_interval,
            ease_factor=ease_factor,
            repetitions=repetitions,
            today=today
        )

        # 3. Save to database
        await self.repo.save_chapter_mastery(
            student_id=student_id,
            chapter_id=chapter_id,
            mastery_score=new_mastery,
            ease_factor=new_ef,
            interval_days=interval,
            repetitions=new_rep,
            next_review_date=next_review
        )

        return new_mastery, interval, new_ef, new_rep, next_review

    async def get_due_chapters_queue(self, student_id: int, today: date | None = None) -> PriorityQueue:
        """
        Builds and returns the PriorityQueue (min-heap) of all chapters in the student's standard,
        sorted by next_review_date and negative urgency_score.
        """
        if today is None:
            today = date.today()

        # 1. Load student profile to get standard_id
        student = await self.repo.get_student_profile(student_id)
        if not student:
            raise ValueError(f"Student with id {student_id} not found.")

        # 2. Load all active chapters for standard
        chapters = await self.repo.get_standard_chapters_with_subjects(student.standard_id)

        # Filter standard chapters based on selected academic sections in the completed diagnostic session
        from sqlalchemy import text as sa_text
        stmt_attempted = sa_text("""
            SELECT DISTINCT sub.subject_name
            FROM xxed_user_answer_data uad
            JOIN xxed_academic_question_tab aq ON uad.academic_question_id = aq.academic_question_id
            JOIN xxed_chapters_data c ON aq.chapter_id = c.chapter_id
            JOIN xxed_subjects_data sub ON c.subject_id = sub.subject_id
            JOIN xxed_user_assessment_data uass ON uad.user_ass_id = uass.user_ass_id
            WHERE uass.user_id = :student_id AND uass.result_status = 'COMPLETED'
              AND uad.academic_question_id IS NOT NULL AND uad.user_answer IS NOT NULL
        """)
        res_attempted = await self.repo.session.execute(stmt_attempted, {"student_id": student_id})
        attempted_subject_names = [r[0] for r in res_attempted.fetchall()]
        
        CHECKLIST_MAP = {
            "Mathematics": "Mathematics",
            "General Science": "Science",
            "Environmental Studies Part 1": "Science",
            "English": "English",
            "History & Civics": "History and Civics",
            "Environmental Studies Part 2": "History and Civics",
            "Geography": "Geography",
            "Hindi": "Hindi",
            "Marathi": "Marathi"
        }
        allowed_sections = set(CHECKLIST_MAP[name] for name in attempted_subject_names if name in CHECKLIST_MAP)
        
        if allowed_sections:
            try:
                CHECKLIST_TO_DB_SUBJECTS = {
                    "Mathematics": {"Mathematics"},
                    "Science": {"General Science", "Environmental Studies Part 1"},
                    "English": {"English"},
                    "History and Civics": {"History & Civics", "Environmental Studies Part 2"},
                    "Geography": {"Geography"},
                    "Hindi": {"Hindi"},
                    "Marathi": {"Marathi"}
                }
                allowed_subject_names = set()
                for sec in allowed_sections:
                    allowed_subject_names.update(CHECKLIST_TO_DB_SUBJECTS.get(sec, set()))
                
                if allowed_subject_names:
                    chapters = [ch for ch in chapters if ch['subject_name'] in allowed_subject_names]
            except Exception:
                pass

        # 3. Load all chapter masteries
        masteries = {m.chapter_id: m for m in await self.repo.get_all_chapter_masteries(student_id)}
        masteries_score_map = {cid: float(m.mastery_score) for cid, m in masteries.items()}

        # 4. Progressive Chapter Gating: only unlocked chapters can be scheduled
        from app.progress.subject_criticality import SubjectCriticalityEngine
        gating_map = SubjectCriticalityEngine.evaluate_progressive_chapter_gating(chapters, masteries_score_map)

        # 5. Subject-Wise Mastery & Criticality Calculation
        subject_masteries = SubjectCriticalityEngine.compute_subject_masteries(chapters, masteries_score_map)
        subject_criticalities = SubjectCriticalityEngine.calculate_subject_criticalities(subject_masteries)

        pq = PriorityQueue()

        for ch in chapters:
            ch_id = ch['chapter_id']
            gate = gating_map.get(ch_id, {"is_unlocked": True})
            if not gate.get("is_unlocked", True):
                # Gated access: locked chapters are hidden from the active study queue
                continue

            mastery_rec = masteries.get(ch_id)
            canon_subj = SubjectCriticalityEngine.normalize_subject_name(ch['subject_name'])
            subj_crit = subject_criticalities.get(canon_subj, {})
            subj_weight = subj_crit.get("normalized_weight", 1.0 / 7.0)

            if mastery_rec:
                mastery_score = float(mastery_rec.mastery_score)
                next_review = mastery_rec.next_review_date or today
                days_overdue = max(0, (today - next_review).days)
            else:
                next_review = today
                mastery_score = 0.0
                days_overdue = 0

            # Composite Subject Criticality Priority:
            # W_bar_s * (days_overdue + 1.0) * (100.0 - chapter_mastery)
            urgency_score = SubjectCriticalityEngine.compute_composite_chapter_priority(
                subject_criticality_weight=subj_weight,
                chapter_mastery_score=mastery_score,
                days_overdue=days_overdue
            )

            # Additional metadata for planning
            meta = {
                "chapter_name": ch['chapter_name'],
                "chapter_number": ch['chapter_number'],
                "subject_id": ch['subject_id'],
                "subject_name": ch['subject_name'],
                "canonical_subject_name": canon_subj,
                "mastery_score": mastery_score,
                "subject_mastery": subj_crit.get("subject_mastery", 50.0),
                "subject_criticality_index": subj_crit.get("criticality_index", 14.28),
                "subject_tier": subj_crit.get("tier", "Developing"),
                "is_locked": False
            }

            pq.push(
                chapter_id=ch_id,
                next_review_date=next_review,
                urgency_score=urgency_score,
                data=meta
            )

        return pq

    async def get_student_subject_progress(self, student_id: int) -> Dict[str, Any]:
        """
        Returns real-time subject-wise mastery, deficiency gaps, criticality weights,
        tier classifications, and chapter progress for a student.
        """
        student = await self.repo.get_student_profile(student_id)
        if not student:
            raise ValueError(f"Student with id {student_id} not found.")

        from app.progress.subject_criticality import SubjectCriticalityEngine
        chapters = await self.repo.get_standard_chapters_with_subjects(student.standard_id)
        masteries = {m.chapter_id: m for m in await self.repo.get_all_chapter_masteries(student_id)}
        masteries_score_map = {cid: float(m.mastery_score) for cid, m in masteries.items()}

        gating_map = SubjectCriticalityEngine.evaluate_progressive_chapter_gating(chapters, masteries_score_map)
        subject_masteries = SubjectCriticalityEngine.compute_subject_masteries(chapters, masteries_score_map)
        subject_criticalities = SubjectCriticalityEngine.calculate_subject_criticalities(subject_masteries)

        # Count unlocked and mastered chapters per subject
        counts: Dict[str, Dict[str, int]] = {}
        for ch in chapters:
            canon = SubjectCriticalityEngine.normalize_subject_name(ch['subject_name'])
            counts.setdefault(canon, {"total": 0, "unlocked": 0, "mastered": 0})
            counts[canon]["total"] += 1
            cid = ch["chapter_id"]
            if gating_map.get(cid, {}).get("is_unlocked", True):
                counts[canon]["unlocked"] += 1
            if masteries_score_map.get(cid, 0.0) >= 75.0:
                counts[canon]["mastered"] += 1

        response_subjects = []
        for s, crit in subject_criticalities.items():
            ch_info = counts.get(s, {"total": 0, "unlocked": 0, "mastered": 0})
            crit_copy = dict(crit)
            crit_copy.update(ch_info)
            response_subjects.append(crit_copy)

        return {
            "student_id": student_id,
            "standard_id": student.standard_id,
            "subjects": response_subjects
        }

