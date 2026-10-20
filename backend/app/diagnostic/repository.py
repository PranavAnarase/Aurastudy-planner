"""
DiagnosticRepository — SQLAlchemy data access.
Translates domain repository requirements into parameterized SQL/SQLAlchemy.
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, text as sa_text
from typing import List, Dict
from datetime import datetime
from app.models.diagnostic import DiagnosticSession, SessionStatusEnum, DiagnosticQuestion, DiagnosticReport
from app.models.aptitude_category_score import AptitudeCategoryScore
from app.models.student_profile import StudentProfile


class DiagnosticRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_student_profile(self, student_id: int) -> StudentProfile | None:
        stmt = select(StudentProfile).where(StudentProfile.student_id == student_id)
        result = await self.session.execute(stmt)
        return result.scalars().first()

    async def create_session(
        self,
        student_id: int,
        entry_point: str,
        standard_id: int,
        selected_academic_sections: List[str] | None = None
    ) -> DiagnosticSession:
        ds = DiagnosticSession(
            student_id=student_id,
            template_assessment_id=1000,
            status_str=SessionStatusEnum.IN_PROGRESS.value,
            started_at=datetime.utcnow(),
            total_question=0,
            attempted_question=0,
            un_attempted_question=0,
            correct_count=0,
            incorrect_count=0,
            time_taken=0,
            accuracy=0.0,
            percentage=0.0,
            obtained_marks=0.0,
            total_marks=0.0
        )
        self.session.add(ds)
        await self.session.commit()
        await self.session.refresh(ds)
        return ds

    async def get_session(self, session_id: int) -> DiagnosticSession | None:
        stmt = select(DiagnosticSession).where(DiagnosticSession.session_id == session_id)
        result = await self.session.execute(stmt)
        return result.scalars().first()

    async def has_completed_diagnostic(self, student_id: int) -> bool:
        stmt = select(DiagnosticSession.session_id).where(
            DiagnosticSession.student_id == student_id,
            DiagnosticSession.status_str == SessionStatusEnum.COMPLETED.value
        ).limit(1)
        result = await self.session.execute(stmt)
        return result.scalars().first() is not None

    async def get_subjects_by_standard(self, standard_numbers: List[int]) -> Dict[int, List[dict]]:
        """
        Retrieves subjects grouped by standard number (e.g. 5, 6, 7).
        """
        stmt = sa_text("""
            SELECT sub.subject_id, sub.subject_name, s.standard_number
            FROM xxed_subjects_data sub
            JOIN xxed_standards_tab s ON sub.std_id = s.std_id
            WHERE s.standard_number IN :std_nums
        """)
        result = await self.session.execute(stmt, {"std_nums": tuple(standard_numbers)})
        rows = result.fetchall()

        by_std = {n: [] for n in standard_numbers}
        for r in rows:
            by_std[r.standard_number].append({
                "subject_id": r.subject_id,
                "subject_name": r.subject_name
            })
        return by_std

    async def get_academic_questions_pool(self, standard_numbers: List[int]) -> List[dict]:
        """
        Retrieves all academic questions for the given standard numbers.
        """
        stmt = sa_text("""
            SELECT aq.academic_question_id as question_id, aq.subject_id, sub.subject_name, aq.complexity as difficulty, 60 as estimated_seconds,
                   c.chapter_id, c.chapter_id as chapter_number, s.standard_number
            FROM xxed_academic_question_tab aq
            JOIN xxed_chapters_data c ON aq.chapter_id = c.chapter_id
            JOIN xxed_subjects_data sub ON c.subject_id = sub.subject_id
            JOIN xxed_standards_tab s ON sub.std_id = s.std_id
            WHERE s.standard_number IN :std_nums
        """)
        result = await self.session.execute(stmt, {"std_nums": tuple(standard_numbers)})
        rows = result.fetchall()

        return [
            {
                "question_id": r.question_id,
                "subject_id": r.subject_id,
                "subject_name": r.subject_name,
                "difficulty": r.difficulty.value if hasattr(r.difficulty, 'value') else r.difficulty,
                "estimated_seconds": r.estimated_seconds,
                "chapter_id": r.chapter_id,
                "chapter_number": r.chapter_number,
                "standard_number": r.standard_number
            }
            for r in rows
        ]

    async def get_aptitude_questions_pool(self) -> List[dict]:
        """
        Retrieves all aptitude questions.
        """
        stmt = sa_text("""
            SELECT aptitude_question_id, category, complexity as difficulty, 60 as estimated_time_seconds
            FROM xxed_aptitude_question_tab
        """)
        result = await self.session.execute(stmt)
        rows = result.fetchall()

        return [
            {
                "question_id": r.aptitude_question_id,
                "category": r.category,
                "difficulty": r.difficulty.value if hasattr(r.difficulty, 'value') else r.difficulty,
                "estimated_seconds": r.estimated_time_seconds
            }
            for r in rows
        ]

    async def get_syllabus_progress(self, standard_id: int) -> Dict[int, int]:
        """
        Retrieves syllabus pacing mapping (subject_id -> last_taught_chapter_number).
        """
        stmt = sa_text("""
            SELECT subject_id, last_taught_chapter_number
            FROM xxed_syllabus_progress_tab
            WHERE standard_id = :standard_id
        """)
        result = await self.session.execute(stmt, {"standard_id": standard_id})
        rows = result.fetchall()
        return {r.subject_id: r.last_taught_chapter_number for r in rows}

    async def get_chapter_count_for_subject(self, subject_id: int) -> int:
        stmt = sa_text("""
            SELECT COUNT(*) FROM xxed_chapters_data
            WHERE subject_id = :sid
        """)
        result = await self.session.execute(stmt, {"sid": subject_id})
        return result.scalar() or 0

    async def get_academic_question_details(self, question_ids: List[int]) -> List[dict]:
        """
        Fetches detailed info for academic questions (including option text for testing).
        """
        if not question_ids:
            return []
        stmt = sa_text("""
            SELECT aq.academic_question_id as question_id, aq.question_text, aq.option_a, aq.option_b, aq.option_c, aq.option_d, sub.subject_name
            FROM xxed_academic_question_tab aq
            JOIN xxed_chapters_data c ON aq.chapter_id = c.chapter_id
            JOIN xxed_subjects_data sub ON c.subject_id = sub.subject_id
            WHERE aq.academic_question_id IN :qids
        """)
        result = await self.session.execute(stmt, {"qids": tuple(question_ids)})
        rows = result.fetchall()
        return [dict(r._mapping) for r in rows]

    async def get_aptitude_question_details(self, question_ids: List[int]) -> List[dict]:
        """
        Fetches detailed info for aptitude questions.
        """
        if not question_ids:
            return []
        stmt = sa_text("""
            SELECT aptitude_question_id as question_id, question_text, option_a, option_b, option_c, option_d
            FROM xxed_aptitude_question_tab
            WHERE aptitude_question_id IN :qids
        """)
        result = await self.session.execute(stmt, {"qids": tuple(question_ids)})
        rows = result.fetchall()
        return [dict(r._mapping) for r in rows]

    async def save_diagnostic_questions(self, session_id: int, questions_data: List[dict], student_id: int = None):
        # Clear existing ones to prevent duplicates on restart/resume
        await self.session.execute(
            sa_text("DELETE FROM xxed_user_answer_data WHERE user_ass_id = :sid"),
            {"sid": session_id}
        )

        # If student_id not provided, look it up from the session
        if student_id is None:
            res = await self.session.execute(
                sa_text("SELECT user_id FROM xxed_user_assessment_data WHERE user_ass_id = :sid"),
                {"sid": session_id}
            )
            row = res.fetchone()
            student_id = row[0] if row else 0

        for q in questions_data:
            acad_id = q['question_id'] if q['source'] == 'ACADEMIC' else None
            apt_id = q['question_id'] if q['source'] == 'APTITUDE' else None
            await self.session.execute(
                sa_text("""
                    INSERT INTO xxed_user_answer_data (
                        user_id, user_ass_id, academic_question_id, aptitude_question_id,
                        content_type_id, time_taken, attempt_status
                    ) VALUES (
                        :uid, :sid, :acad_id, :apt_id, 5, :qorder, 'NOT_ANSWERED'
                    )
                """),
                {
                    "uid": student_id,
                    "sid": session_id,
                    "acad_id": acad_id,
                    "apt_id": apt_id,
                    "qorder": q.get('order', 1)
                }
            )
        await self.session.execute(
            sa_text("""
                UPDATE xxed_user_assessment_data
                SET total_question = :tq,
                    un_attempted_question = :tq,
                    attempted_question = 0,
                    correct_count = 0,
                    incorrect_count = 0,
                    time_taken = 0,
                    percentage = 0,
                    accuracy = 0,
                    obtained_marks = 0,
                    total_marks = :tm
                WHERE user_ass_id = :sid
            """),
            {"sid": session_id, "tq": len(questions_data), "tm": len(questions_data)}
        )
        await self.session.commit()

    async def get_session_questions(self, session_id: int) -> List[DiagnosticQuestion]:
        stmt = sa_text("""
            SELECT user_answer_id, user_ass_id, academic_question_id, aptitude_question_id, time_taken
            FROM xxed_user_answer_data
            WHERE user_ass_id = :sid
            ORDER BY user_answer_id ASC
        """)
        result = await self.session.execute(stmt, {"sid": session_id})
        rows = result.fetchall()
        questions = []
        for r in rows:
            dq = DiagnosticQuestion()
            dq.diagnostic_question_id = r.user_answer_id
            dq.session_id = r.user_ass_id
            dq.academic_question_id = r.academic_question_id
            dq.aptitude_question_id = r.aptitude_question_id
            questions.append(dq)
        return questions

    async def get_academic_questions_by_ids(self, question_ids: List[int]) -> List[dict]:
        if not question_ids:
            return []
        stmt = sa_text("""
            SELECT academic_question_id as question_id, chapter_id, complexity as difficulty, 60 as estimated_seconds, correct_option
            FROM xxed_academic_question_tab
            WHERE academic_question_id IN :qids
        """)
        result = await self.session.execute(stmt, {"qids": tuple(question_ids)})
        rows = result.fetchall()
        return [
            {
                "question_id": r.question_id,
                "chapter_id": r.chapter_id,
                "difficulty": r.difficulty.value if hasattr(r.difficulty, 'value') else r.difficulty,
                "estimated_seconds": r.estimated_seconds,
                "correct_option": r.correct_option
            }
            for r in rows
        ]

    async def get_aptitude_questions_by_ids(self, question_ids: List[int]) -> List[dict]:
        if not question_ids:
            return []
        stmt = sa_text("""
            SELECT aptitude_question_id as question_id, category, complexity as difficulty, 60 as estimated_time_seconds, correct_option
            FROM xxed_aptitude_question_tab
            WHERE aptitude_question_id IN :qids
        """)
        result = await self.session.execute(stmt, {"qids": tuple(question_ids)})
        rows = result.fetchall()
        return [
            {
                "question_id": r.question_id,
                "category": r.category,
                "difficulty": r.difficulty.value if hasattr(r.difficulty, 'value') else r.difficulty,
                "estimated_seconds": r.estimated_time_seconds,
                "correct_option": r.correct_option
            }
            for r in rows
        ]

    async def save_diagnostic_responses(self, session_id: int, responses_data: List[dict]):
        for r in responses_data:
            acad_id = r['question_id'] if r['source'] == 'ACADEMIC' else None
            apt_id = r['question_id'] if r['source'] == 'APTITUDE' else None
            marks = 1.00 if r.get('is_correct') else 0.00
            
            stmt = sa_text("""
                UPDATE xxed_user_answer_data
                SET user_answer = :ans,
                    obtained_marks = :marks,
                    time_taken = :time,
                    attempt_status = 'ANSWERED'
                WHERE user_ass_id = :sid
                  AND ((academic_question_id IS NOT NULL AND academic_question_id = :acad_id)
                       OR (aptitude_question_id IS NOT NULL AND aptitude_question_id = :apt_id))
            """)
            await self.session.execute(stmt, {
                "sid": session_id,
                "ans": r.get('selected_option'),
                "marks": marks,
                "time": r.get('time_taken_seconds', 0),
                "acad_id": acad_id,
                "apt_id": apt_id
            })
        await self.session.commit()

    async def save_diagnostic_report(self, session_id: int, report_data: dict):
        acc = round(report_data.get('academic_accuracy', 0.0), 2)
        stmt = sa_text("""
            UPDATE xxed_user_assessment_data uad
            LEFT JOIN (
                SELECT 
                    user_ass_id,
                    COUNT(*) as total_q,
                    SUM(CASE WHEN user_answer IS NOT NULL AND user_answer != '' THEN 1 ELSE 0 END) as att_q,
                    SUM(CASE WHEN user_answer IS NULL OR user_answer = '' THEN 1 ELSE 0 END) as unatt_q,
                    SUM(CASE WHEN obtained_marks > 0 THEN 1 ELSE 0 END) as corr_cnt,
                    SUM(CASE WHEN (user_answer IS NOT NULL AND user_answer != '') AND (obtained_marks IS NULL OR obtained_marks = 0) THEN 1 ELSE 0 END) as incorr_cnt,
                    COALESCE(SUM(time_taken), 0) as tot_time,
                    COALESCE(SUM(obtained_marks), 0) as tot_obt
                FROM xxed_user_answer_data
                WHERE user_ass_id = :sid
                GROUP BY user_ass_id
            ) ans ON uad.user_ass_id = ans.user_ass_id
            SET 
                uad.accuracy = :acc,
                uad.percentage = :acc,
                uad.obtained_percentage = :acc,
                uad.total_question = COALESCE(ans.total_q, uad.total_question, 0),
                uad.attempted_question = COALESCE(ans.att_q, 0),
                uad.un_attempted_question = COALESCE(ans.unatt_q, 0),
                uad.correct_count = COALESCE(ans.corr_cnt, 0),
                uad.incorrect_count = COALESCE(ans.incorr_cnt, 0),
                uad.time_taken = COALESCE(ans.tot_time, 0),
                uad.obtained_marks = COALESCE(ans.tot_obt, 0.0),
                uad.total_marks = COALESCE(ans.total_q, 0.0),
                uad.result_status = 'COMPLETED',
                uad.ass_end_time = NOW()
            WHERE uad.user_ass_id = :sid
        """)
        await self.session.execute(stmt, {
            "acc": acc,
            "sid": session_id
        })
        await self.session.commit()

    async def save_aptitude_category_scores(self, session_id: int, scores_data: Dict[str, dict]):
        # Category scores are aggregated dynamically on query from xxed_user_answer_data
        pass

    async def get_aptitude_category_scores(self, session_id: int) -> List[AptitudeCategoryScore]:
        stmt = sa_text("""
            SELECT aq.category,
                   ROUND(AVG(COALESCE(uad.obtained_marks, 0)) * 100, 2) as accuracy,
                   ROUND(AVG(COALESCE(uad.obtained_marks, 0)) * 100, 2) as percentile
            FROM xxed_user_answer_data uad
            JOIN xxed_aptitude_question_tab aq ON uad.aptitude_question_id = aq.aptitude_question_id
            WHERE uad.user_ass_id = :sid
            GROUP BY aq.category
        """)
        result = await self.session.execute(stmt, {"sid": session_id})
        rows = result.fetchall()
        return [
            AptitudeCategoryScore(
                session_id=session_id,
                category=r.category,
                accuracy=float(r.accuracy or 0.0),
                percentile=float(r.percentile or 0.0)
            )
            for r in rows
        ]

    async def get_diagnostic_report(self, session_id: int) -> DiagnosticReport | None:
        stmt = sa_text("""
            SELECT user_ass_id, user_id, accuracy, obtained_percentage
            FROM xxed_user_assessment_data
            WHERE user_ass_id = :sid
        """)
        result = await self.session.execute(stmt, {"sid": session_id})
        row = result.fetchone()
        if not row:
            return None

        # Calculate aptitude score dynamically
        stmt_apt = sa_text("""
            SELECT ROUND(AVG(COALESCE(obtained_marks, 0)) * 100, 2)
            FROM xxed_user_answer_data
            WHERE user_ass_id = :sid AND aptitude_question_id IS NOT NULL
        """)
        res_apt = await self.session.execute(stmt_apt, {"sid": session_id})
        apt_score = float(res_apt.scalar() or 0.0)

        # Get weakest chapters from chapter mastery
        stmt_weak = sa_text("""
            SELECT chapter_id
            FROM xxed_chapter_mastery_tab
            WHERE user_id = :uid
            ORDER BY mastery_score ASC
            LIMIT 5
        """)
        res_weak = await self.session.execute(stmt_weak, {"uid": row.user_id})
        weakest_ids = [r[0] for r in res_weak.fetchall()]

        acad_acc = float(row.accuracy or row.obtained_percentage or 0.0)
        health_score = round((acad_acc * 0.5) + (apt_score * 0.3) + 20.0, 2)

        return DiagnosticReport(
            session_id=session_id,
            aptitude_score=apt_score,
            aptitude_percentile=apt_score,
            academic_accuracy=acad_acc,
            study_health_score=health_score,
            weakest_chapter_ids=weakest_ids
        )

    async def get_chapters_by_ids(self, chapter_ids: List[int]) -> List[dict]:
        if not chapter_ids:
            return []
        stmt = sa_text("""
            SELECT chapter_id, chapter_name, subject_id
            FROM xxed_chapters_data
            WHERE chapter_id IN :cids
        """)
        result = await self.session.execute(stmt, {"cids": tuple(chapter_ids)})
        rows = result.fetchall()
        return [dict(r._mapping) for r in rows]

    async def mark_session_completed(self, session_id: int):
        stmt = update(DiagnosticSession).where(
            DiagnosticSession.session_id == session_id
        ).values(
            status_str=SessionStatusEnum.COMPLETED.value,
            completed_at=datetime.utcnow()
        )
        await self.session.execute(stmt)
        await self.session.commit()

    async def upsert_chapter_mastery(self, student_id: int, chapter_id: int, score: float):
        """
        Upserts chapter mastery for a student.
        Uses 90+ -> HIGH, 50-90 -> MEDIUM, <50 -> LOW.
        """
        rounded_score = round(score, 2)
        confidence = "MEDIUM"
        if rounded_score >= 90.0:
            confidence = "HIGH"
        elif rounded_score < 50.0:
            confidence = "LOW"

        stmt = sa_text("""
            INSERT INTO xxed_chapter_mastery_tab (user_id, chapter_id, mastery_score, xxed_confidence, last_assessed_at)
            VALUES (:student_id, :chapter_id, :score, :confidence, NOW())
            ON DUPLICATE KEY UPDATE
                mastery_score = VALUES(mastery_score),
                xxed_confidence = VALUES(xxed_confidence),
                last_assessed_at = NOW()
        """)
        await self.session.execute(stmt, {
            "student_id": student_id,
            "chapter_id": chapter_id,
            "score": rounded_score,
            "confidence": confidence
        })
        await self.session.commit()
