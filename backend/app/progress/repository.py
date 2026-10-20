"""
ProgressRepository — SQLAlchemy implementation.
Exposes queries for retrieving and saving chapter mastery and SM-2 data.
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text as sa_text
from typing import List
from datetime import date

from app.models.chapter_mastery import ChapterMastery
from app.models.student_profile import StudentProfile


class ProgressRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_student_profile(self, student_id: int) -> StudentProfile | None:
        stmt = select(StudentProfile).where(StudentProfile.student_id == student_id)
        result = await self.session.execute(stmt)
        return result.scalars().first()

    async def get_chapter_mastery(self, student_id: int, chapter_id: int) -> ChapterMastery | None:
        stmt = select(ChapterMastery).where(
            ChapterMastery.student_id == student_id,
            ChapterMastery.chapter_id == chapter_id
        )
        result = await self.session.execute(stmt)
        return result.scalars().first()

    async def get_all_chapter_masteries(self, student_id: int) -> List[ChapterMastery]:
        stmt = select(ChapterMastery).where(ChapterMastery.student_id == student_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_standard_chapters_with_subjects(self, standard_id: int) -> List[dict]:
        """
        Fetches all active chapters in the standard, along with their subject name.
        """
        stmt = sa_text("""
            SELECT c.chapter_id, c.chapter_name, c.chapter_id as chapter_number, sub.subject_id, sub.subject_name
            FROM xxed_chapters_data c
            JOIN xxed_subjects_data sub ON c.subject_id = sub.subject_id
            WHERE sub.std_id = :std_id
        """)
        result = await self.session.execute(stmt, {"std_id": standard_id})
        rows = result.fetchall()
        return [dict(r._mapping) for r in rows]

    async def save_chapter_mastery(
        self,
        student_id: int,
        chapter_id: int,
        mastery_score: float,
        ease_factor: float,
        interval_days: int,
        repetitions: int,
        next_review_date: date
    ) -> ChapterMastery:
        """
        Saves or updates the chapter mastery record using MySQL INSERT ... ON DUPLICATE KEY UPDATE.
        Also resolves confidence: >=90 -> HIGH, >=50 -> MEDIUM, else LOW.
        """
        rounded_mastery = round(mastery_score, 2)
        rounded_ease = round(ease_factor, 2)
        confidence = "MEDIUM"
        if rounded_mastery >= 90.0:
            confidence = "HIGH"
        elif rounded_mastery < 50.0:
            confidence = "LOW"

        stmt = sa_text("""
            INSERT INTO xxed_chapter_mastery_tab (
                user_id, chapter_id, mastery_score, xxed_confidence,
                xxed_ease_factor, xxed_interval_days, xxed_repetitions, xxed_next_review_date, last_assessed_at
            )
            VALUES (
                :student_id, :chapter_id, :mastery_score, :confidence,
                :ease_factor, :interval_days, :repetitions, :next_review_date, NOW()
            )
            ON DUPLICATE KEY UPDATE
                mastery_score = VALUES(mastery_score),
                xxed_confidence = VALUES(xxed_confidence),
                xxed_ease_factor = VALUES(xxed_ease_factor),
                xxed_interval_days = VALUES(xxed_interval_days),
                xxed_repetitions = VALUES(xxed_repetitions),
                xxed_next_review_date = VALUES(xxed_next_review_date),
                last_assessed_at = NOW()
        """)
        await self.session.execute(stmt, {
            "student_id": student_id,
            "chapter_id": chapter_id,
            "mastery_score": rounded_mastery,
            "confidence": confidence,
            "ease_factor": rounded_ease,
            "interval_days": interval_days,
            "repetitions": repetitions,
            "next_review_date": next_review_date
        })
        await self.session.commit()

        # Query and return the updated object
        res = await self.get_chapter_mastery(student_id, chapter_id)
        assert res is not None
        return res

    async def get_attempted_subject_ids(self, student_id: int) -> List[int]:
        """
        Gets the subject IDs attempted (answered at least one question) in the student's completed diagnostic sessions.
        """
        stmt_subjects = sa_text("""
            SELECT DISTINCT aq.subject_id
            FROM xxed_user_answer_data uad
            JOIN xxed_academic_question_tab aq ON uad.academic_question_id = aq.academic_question_id
            JOIN xxed_user_assessment_data uass ON uad.user_ass_id = uass.user_ass_id
            WHERE uass.user_id = :student_id AND uass.result_status = 'COMPLETED' AND uad.academic_question_id IS NOT NULL AND uad.user_answer IS NOT NULL
        """)
        res_subjects = await self.session.execute(stmt_subjects, {"student_id": student_id})
        return [r[0] for r in res_subjects.fetchall()]

    async def get_chapter_stage_state(self, student_id: int, chapter_id: int) -> dict:
        """
        Retrieves the 4-stage pipeline progress for a chapter.
        """
        stmt = sa_text("""
            SELECT xxed_current_stage as current_stage, xxed_concept_completed as concept_completed,
                   xxed_practice_completed as practice_completed, xxed_recall_completed as recall_completed,
                   xxed_assessment_unlocked as assessment_unlocked, mastery_score
            FROM xxed_chapter_mastery_tab
            WHERE user_id = :sid AND chapter_id = :cid
        """)
        res = await self.session.execute(stmt, {"sid": student_id, "cid": chapter_id})
        row = res.fetchone()
        if row:
            stage_val = row.current_stage.value if hasattr(row.current_stage, 'value') else row.current_stage
            return {
                "current_stage": stage_val or "CONCEPT_STUDY",
                "concept_completed": bool(row.concept_completed),
                "practice_completed": bool(row.practice_completed),
                "recall_completed": bool(row.recall_completed),
                "assessment_unlocked": bool(row.assessment_unlocked),
                "mastery_score": float(row.mastery_score or 0.0)
            }
        return {
            "current_stage": "CONCEPT_STUDY",
            "concept_completed": False,
            "practice_completed": False,
            "recall_completed": False,
            "assessment_unlocked": False,
            "mastery_score": 0.0
        }

    async def update_chapter_stage_state(
        self,
        student_id: int,
        chapter_id: int,
        current_stage: str,
        concept_completed: bool,
        practice_completed: bool,
        recall_completed: bool,
        assessment_unlocked: bool
    ):
        """
        Updates or initializes chapter_mastery stage tracking flags.
        """
        stmt = sa_text("""
            INSERT INTO xxed_chapter_mastery_tab (
                user_id, chapter_id, mastery_score, xxed_confidence,
                xxed_current_stage, xxed_concept_completed, xxed_practice_completed, xxed_recall_completed, xxed_assessment_unlocked
            )
            VALUES (
                :sid, :cid, 0.00, 'LOW',
                :stage, :concept, :practice, :recall, :unlocked
            )
            ON DUPLICATE KEY UPDATE
                xxed_current_stage = VALUES(xxed_current_stage),
                xxed_concept_completed = VALUES(xxed_concept_completed),
                xxed_practice_completed = VALUES(xxed_practice_completed),
                xxed_recall_completed = VALUES(xxed_recall_completed),
                xxed_assessment_unlocked = VALUES(xxed_assessment_unlocked)
        """)
        await self.session.execute(stmt, {
            "sid": student_id,
            "cid": chapter_id,
            "stage": current_stage,
            "concept": 1 if concept_completed else 0,
            "practice": 1 if practice_completed else 0,
            "recall": 1 if recall_completed else 0,
            "unlocked": 1 if assessment_unlocked else 0
        })
        await self.session.commit()

