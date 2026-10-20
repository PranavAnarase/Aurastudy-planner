from sqlalchemy import Column, Integer, String, Numeric, ForeignKey
from sqlalchemy.orm import relationship
from .base import Base

class Chapter(Base):
    __tablename__ = 'xxed_chapters_data'

    chapter_id = Column(Integer, primary_key=True)
    chapter_name = Column(String(255), nullable=False)
    subject_id = Column(Integer, ForeignKey('xxed_subjects_data.subject_id'), nullable=False)
    total_topics = Column(Integer, nullable=True)
    weightage = Column(Numeric(5, 2), nullable=True)

    # Backwards compatibility properties
    @property
    def chapter_number(self) -> int:
        return self.chapter_id

    @property
    def chapter_code(self) -> str:
        return f"CH_{self.chapter_id}"

    @property
    def display_order(self) -> int:
        return self.chapter_id

    @property
    def is_active(self) -> bool:
        return True

    subject = relationship("Subject", back_populates="chapters")
    academic_questions = relationship("AcademicQuestion", back_populates="chapter")
    chapter_mastery = relationship("ChapterMastery", back_populates="chapter")
    daily_plan_tasks = relationship("DailyPlanTask", back_populates="chapter")
