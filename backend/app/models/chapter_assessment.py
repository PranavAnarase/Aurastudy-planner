from sqlalchemy import Column, BigInteger, Integer, Numeric, String, ForeignKey, TIMESTAMP, text
from sqlalchemy.orm import relationship, backref
from .base import Base
import enum

class AssessmentStatusEnum(str, enum.Enum):
    IN_PROGRESS = 'IN_PROGRESS'
    COMPLETED = 'COMPLETED'
    ABANDONED = 'ABANDONED'

class AssessmentTypeEnum(str, enum.Enum):
    CHAPTER_TEST = 'CHAPTER_TEST'
    SPACED_REVIEW = 'SPACED_REVIEW'

class AttemptStatusEnum(str, enum.Enum):
    ANSWERED = 'ANSWERED'
    SKIPPED = 'SKIPPED'
    TIMED_OUT = 'TIMED_OUT'

class ChapterAssessment(Base):
    __tablename__ = 'xxed_user_assessment_data'
    __table_args__ = {'extend_existing': True}

    assessment_id = Column("user_ass_id", BigInteger, primary_key=True, autoincrement=True)
    student_id = Column("user_id", BigInteger, ForeignKey('xxed_user_profile_tab.user_id', ondelete='CASCADE'), nullable=False)
    template_assessment_id = Column("assessment_id", Integer, nullable=False, default=2000)
    attempt_number = Column("attempt_count", Integer, nullable=False, server_default=text('1'))
    total_questions = Column("total_question", Integer, nullable=True, default=0)
    attempted_question = Column(Integer, nullable=True, default=0)
    un_attempted_question = Column(Integer, nullable=True, default=0)
    correct_count = Column(Integer, nullable=True, default=0)
    incorrect_count = Column(Integer, nullable=True, default=0)
    time_taken = Column(Integer, nullable=True, default=0)
    obtained_marks = Column(Numeric(8, 2), nullable=True, default=0.0)
    total_marks = Column(Numeric(8, 2), nullable=True, default=0.0)
    accuracy = Column(Numeric(5, 2), nullable=True, server_default=text('0.00'))
    # percentage column: server_default only — SQLAlchemy will NOT send it in
    # INSERT, letting the DB use its default. Never set default= here.
    percentage = Column(Numeric(5, 2), nullable=True, server_default=text('0.00'))
    status_str = Column("result_status", String(50), nullable=False, server_default='IN_PROGRESS')
    started_at = Column("ass_start_time", TIMESTAMP, nullable=True)
    completed_at = Column("ass_end_time", TIMESTAMP, nullable=True)

    @property
    def status(self) -> AssessmentStatusEnum:
        try:
            return AssessmentStatusEnum(self.status_str)
        except Exception:
            return AssessmentStatusEnum.IN_PROGRESS

    @status.setter
    def status(self, val):
        self.status_str = val.value if hasattr(val, 'value') else str(val)

    @property
    def assessment_type(self) -> AssessmentTypeEnum:
        return AssessmentTypeEnum.CHAPTER_TEST

    @assessment_type.setter
    def assessment_type(self, val):
        pass

    @property
    def ai_overall_summary(self) -> str | None:
        return None

    @ai_overall_summary.setter
    def ai_overall_summary(self, val):
        pass  # Not stored in xxed_user_assessment_data

    student = relationship(
        "StudentProfile",
        backref=backref("chapter_assessments", overlaps="student,diagnostic_sessions"),
        overlaps="student,diagnostic_sessions"
    )

class ChapterAssessmentItem(Base):
    __tablename__ = 'xxed_user_answer_data'
    __table_args__ = {'extend_existing': True}

    item_id = Column("user_answer_id", BigInteger, primary_key=True, autoincrement=True)
    assessment_id = Column("user_ass_id", BigInteger, nullable=False)
    question_id = Column("academic_question_id", BigInteger, nullable=False)
    question_order = Column("time_taken", Integer, nullable=True, default=1)

class ChapterAssessmentResponse(Base):
    __tablename__ = 'xxed_user_answer_data'
    __table_args__ = {'extend_existing': True}

    response_id = Column("user_answer_id", BigInteger, primary_key=True, autoincrement=True)
    assessment_id = Column("user_ass_id", BigInteger, ForeignKey('xxed_user_assessment_data.user_ass_id', ondelete='CASCADE'), nullable=False)
    question_id = Column("academic_question_id", BigInteger, nullable=False)
    selected_option = Column("user_answer", String(50), nullable=True)
    obtained_marks = Column(Numeric(5, 2), nullable=True)
    time_taken_seconds = Column("time_taken", Integer, nullable=True, default=0)
    attempt_status_str = Column("attempt_status", String(50), nullable=False, server_default='ANSWERED')

    @property
    def is_correct(self) -> bool:
        return bool(self.obtained_marks and self.obtained_marks > 0)

    @is_correct.setter
    def is_correct(self, val: bool):
        self.obtained_marks = 1.00 if val else 0.00

    @property
    def attempt_status(self) -> AttemptStatusEnum:
        try:
            return AttemptStatusEnum(self.attempt_status_str)
        except Exception:
            return AttemptStatusEnum.ANSWERED

    @attempt_status.setter
    def attempt_status(self, val):
        self.attempt_status_str = val.value if hasattr(val, 'value') else str(val)

    @property
    def ai_concept_gap(self) -> str | None:
        return None

    @ai_concept_gap.setter
    def ai_concept_gap(self, val):
        pass  # Not stored in xxed_user_answer_data

    @property
    def ai_misconception_feedback(self) -> str | None:
        return None

    @ai_misconception_feedback.setter
    def ai_misconception_feedback(self, val):
        pass  # Not stored in xxed_user_answer_data

    @property
    def ai_memory_tip(self) -> str | None:
        return None

    @ai_memory_tip.setter
    def ai_memory_tip(self, val):
        pass  # Not stored in xxed_user_answer_data
