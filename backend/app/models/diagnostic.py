from sqlalchemy import Column, BigInteger, Integer, String, ForeignKey, TIMESTAMP, text, Numeric
from sqlalchemy.orm import relationship
from .base import Base
import enum

from sqlalchemy.ext.hybrid import hybrid_property

class SessionStatusEnum(str, enum.Enum):
    IN_PROGRESS = 'IN_PROGRESS'
    COMPLETED = 'COMPLETED'
    ABANDONED = 'ABANDONED'

class EntryPointEnum(str, enum.Enum):
    START_OF_YEAR = 'START_OF_YEAR'
    MID_SEMESTER = 'MID_SEMESTER'
    END_OF_TERM = 'END_OF_TERM'

class QuestionSourceEnum(str, enum.Enum):
    ACADEMIC = 'ACADEMIC'
    APTITUDE = 'APTITUDE'

class DiagnosticSectionEnum(str, enum.Enum):
    APTITUDE = 'APTITUDE'
    ACADEMIC = 'ACADEMIC'

class DiagnosticSession(Base):
    __tablename__ = 'xxed_user_assessment_data'
    __table_args__ = {'extend_existing': True}

    session_id = Column("user_ass_id", BigInteger, primary_key=True, autoincrement=True)
    student_id = Column("user_id", BigInteger, ForeignKey('xxed_user_profile_tab.user_id', ondelete='CASCADE'), nullable=False)
    template_assessment_id = Column("assessment_id", Integer, nullable=False, default=1000)
    started_at = Column("ass_start_time", TIMESTAMP, nullable=True, server_default=text('CURRENT_TIMESTAMP'))
    completed_at = Column("ass_end_time", TIMESTAMP, nullable=True)
    status_str = Column("result_status", String(50), nullable=False, server_default='IN_PROGRESS')
    total_question = Column(Integer, nullable=True, default=0)
    attempted_question = Column(Integer, nullable=True, default=0)
    un_attempted_question = Column(Integer, nullable=True, default=0)
    correct_count = Column(Integer, nullable=True, default=0)
    incorrect_count = Column(Integer, nullable=True, default=0)
    time_taken = Column(Integer, nullable=True, default=0)
    accuracy = Column(Numeric(5, 2), nullable=True, default=0.0)
    percentage = Column(Numeric(5, 2), nullable=True, default=0.0)
    obtained_marks = Column(Numeric(8, 2), nullable=True, default=0.0)
    total_marks = Column(Numeric(8, 2), nullable=True, default=0.0)

    @hybrid_property
    def status(self) -> SessionStatusEnum:
        try:
            return SessionStatusEnum(self.status_str)
        except Exception:
            return SessionStatusEnum.IN_PROGRESS

    @status.expression
    def status(cls):
        return cls.status_str

    @status.setter
    def status(self, val):
        self.status_str = val.value if hasattr(val, 'value') else str(val)

    @property
    def entry_point(self) -> EntryPointEnum:
        return EntryPointEnum.START_OF_YEAR

    @property
    def standard_id(self) -> int:
        return 3

    @property
    def selected_academic_sections(self):
        return None

    student = relationship("StudentProfile", overlaps="chapter_assessments")

class DiagnosticQuestion(Base):
    __tablename__ = 'xxed_user_answer_data'
    __table_args__ = {'extend_existing': True}

    diagnostic_question_id = Column("user_answer_id", BigInteger, primary_key=True, autoincrement=True)
    session_id = Column("user_ass_id", BigInteger, nullable=False)
    academic_question_id = Column(BigInteger, nullable=True)
    aptitude_question_id = Column(BigInteger, nullable=True)

    @property
    def question_source(self) -> QuestionSourceEnum:
        return QuestionSourceEnum.ACADEMIC if self.academic_question_id else QuestionSourceEnum.APTITUDE

    @property
    def question_id(self) -> int:
        return self.academic_question_id or self.aptitude_question_id or 1

    @property
    def question_order(self) -> int:
        return 1

    @property
    def section(self) -> DiagnosticSectionEnum:
        return DiagnosticSectionEnum.ACADEMIC if self.academic_question_id else DiagnosticSectionEnum.APTITUDE

class DiagnosticResponse(Base):
    __tablename__ = 'xxed_user_answer_data'
    __table_args__ = {'extend_existing': True}

    response_id = Column("user_answer_id", BigInteger, primary_key=True, autoincrement=True)
    session_id = Column("user_ass_id", BigInteger, ForeignKey('xxed_user_assessment_data.user_ass_id', ondelete='CASCADE'), nullable=False)
    academic_question_id = Column(BigInteger, nullable=True)
    aptitude_question_id = Column(BigInteger, nullable=True)
    selected_option = Column("user_answer", String(50), nullable=True)
    obtained_marks = Column(Numeric(5, 2), nullable=True)
    time_taken_seconds = Column("time_taken", Integer, nullable=True)

    @property
    def question_source(self) -> QuestionSourceEnum:
        return QuestionSourceEnum.ACADEMIC if self.academic_question_id else QuestionSourceEnum.APTITUDE

    @property
    def question_id(self) -> int:
        return self.academic_question_id or self.aptitude_question_id or 1

    @property
    def is_correct(self) -> bool:
        return bool(self.obtained_marks and self.obtained_marks > 0)

    @is_correct.setter
    def is_correct(self, val: bool):
        self.obtained_marks = 1.00 if val else 0.00



class DiagnosticReport:
    def __init__(self, session_id: int, aptitude_score=0.0, aptitude_percentile=0.0, academic_accuracy=0.0, study_health_score=0.0, weakest_chapter_ids=None):
        self.session_id = session_id
        self.aptitude_score = aptitude_score
        self.aptitude_percentile = aptitude_percentile
        self.academic_accuracy = academic_accuracy
        self.study_health_score = study_health_score
        self.weakest_chapter_ids = weakest_chapter_ids or []
