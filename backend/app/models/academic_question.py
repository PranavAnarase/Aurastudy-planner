from sqlalchemy import Column, BigInteger, Integer, String, Text, ForeignKey, Numeric, Boolean, TIMESTAMP, text
from sqlalchemy.orm import relationship, synonym
from .base import Base
import enum

class DifficultyEnum(str, enum.Enum):
    EASY = 'EASY'
    MEDIUM = 'MEDIUM'
    HARD = 'HARD'

class AcademicQuestion(Base):
    __tablename__ = 'xxed_academic_question_tab'

    question_id = Column("academic_question_id", BigInteger, primary_key=True, autoincrement=True)
    chapter_question_id = synonym("question_id")
    standard_id = Column(BigInteger, ForeignKey('xxed_standards_tab.std_id'), nullable=False)
    subject_id = Column(Integer, ForeignKey('xxed_subjects_data.subject_id'), nullable=False)
    chapter_id = Column(Integer, ForeignKey('xxed_chapters_data.chapter_id'), nullable=False)
    topic_id = Column(Integer, nullable=True)
    question_type_id = Column(BigInteger, ForeignKey('xxed_question_type_tab.question_type_id'), nullable=False)

    question_text = Column(Text, nullable=False)
    option_a = Column(Text, nullable=True)
    option_b = Column(Text, nullable=True)
    option_c = Column(Text, nullable=True)
    option_d = Column(Text, nullable=True)
    correct_option = Column(String(1), nullable=True)
    correct_answer_text = Column(Text, nullable=True)
    difficulty = Column("complexity", String(50), nullable=True)
    marks = Column(Numeric(5, 2), server_default=text('1.00'))
    is_active = Column(Boolean, nullable=False, server_default=text('1'))
    created_at = Column(TIMESTAMP, nullable=False, server_default=text('CURRENT_TIMESTAMP'))
    updated_at = Column(TIMESTAMP, nullable=False, server_default=text('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'))

    # Compatibility properties
    @property
    def estimated_seconds(self) -> int:
        return 60

    @property
    def explanation(self) -> str:
        return self.correct_answer_text or ""

    @property
    def question_code(self) -> str:
        return f"Q_{self.question_id}"

    subject = relationship("Subject", back_populates="academic_questions")
    chapter = relationship("Chapter", back_populates="academic_questions")
    question_type = relationship("QuestionType", back_populates="academic_questions")
