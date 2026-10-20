"""
SQLAlchemy model for chapter_mastery table mapped to xxed_chapter_mastery_tab.
"""

from sqlalchemy import Column, BigInteger, Numeric, Integer, Date, Enum, ForeignKey, TIMESTAMP, text
from sqlalchemy.orm import relationship
from .base import Base
import enum

class ConfidenceEnum(str, enum.Enum):
    LOW = 'LOW'
    MEDIUM = 'MEDIUM'
    HIGH = 'HIGH'

class StageEnum(str, enum.Enum):
    CONCEPT_STUDY = 'CONCEPT_STUDY'
    PRACTICE_DRILL = 'PRACTICE_DRILL'
    ACTIVE_RECALL = 'ACTIVE_RECALL'
    READY_FOR_ASSESSMENT = 'READY_FOR_ASSESSMENT'
    COMPLETED = 'COMPLETED'

class ChapterMastery(Base):
    __tablename__ = 'xxed_chapter_mastery_tab'

    chapter_mastery_id = Column(BigInteger, primary_key=True, autoincrement=True)
    student_id = Column("user_id", BigInteger, ForeignKey('xxed_user_profile_tab.user_id', ondelete='CASCADE'), nullable=False)
    chapter_id = Column("chapter_id", Integer, ForeignKey('xxed_chapters_data.chapter_id', ondelete='CASCADE'), nullable=False)
    mastery_score = Column(Numeric(5, 2), nullable=False, server_default=text('0.00'))
    chapter_deficiency = Column(Numeric(5, 2), nullable=False, server_default=text('0.00'))
    chapter_priority = Column(Numeric(5, 2), nullable=False, server_default=text('0.00'))
    last_assessed = Column("last_assessed_at", TIMESTAMP, nullable=True)
    review_count = Column(Integer, nullable=False, server_default=text('0'))

    # Spaced Repetition / Stage Tracking
    current_stage = Column("xxed_current_stage", Enum(StageEnum), nullable=False, server_default='CONCEPT_STUDY')
    concept_completed = Column("xxed_concept_completed", Integer, nullable=False, server_default=text('0'))
    practice_completed = Column("xxed_practice_completed", Integer, nullable=False, server_default=text('0'))
    recall_completed = Column("xxed_recall_completed", Integer, nullable=False, server_default=text('0'))
    assessment_unlocked = Column("xxed_assessment_unlocked", Integer, nullable=False, server_default=text('0'))

    ease_factor = Column("xxed_ease_factor", Numeric(4, 2), nullable=False, server_default=text('2.50'))
    interval_days = Column("xxed_interval_days", Integer, nullable=False, server_default=text('1'))
    repetitions = Column("xxed_repetitions", Integer, nullable=False, server_default=text('0'))
    next_review_date = Column("xxed_next_review_date", Date, nullable=True)

    confidence_col = Column("xxed_confidence", Enum(ConfidenceEnum), nullable=False, server_default='LOW')

    @property
    def confidence(self) -> ConfidenceEnum:
        score = float(self.mastery_score or 0)
        if score >= 80:
            return ConfidenceEnum.HIGH
        elif score >= 50:
            return ConfidenceEnum.MEDIUM
        return ConfidenceEnum.LOW

    @confidence.setter
    def confidence(self, val):
        if isinstance(val, ConfidenceEnum):
            self.confidence_col = val
        elif isinstance(val, str):
            try:
                self.confidence_col = ConfidenceEnum(val)
            except Exception:
                self.confidence_col = ConfidenceEnum.LOW

    @property
    def learning_gap(self) -> float:
        return float(self.chapter_deficiency or (100.0 - float(self.mastery_score or 0)))

    student = relationship("StudentProfile", back_populates="chapter_mastery")
    chapter = relationship("Chapter", back_populates="chapter_mastery")
