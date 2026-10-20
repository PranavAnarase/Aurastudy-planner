from sqlalchemy import Column, Integer, BigInteger, String, Numeric, ForeignKey
from sqlalchemy.orm import relationship
from .base import Base

class Subject(Base):
    __tablename__ = 'xxed_subjects_data'

    subject_id = Column(Integer, primary_key=True)
    subject_name = Column(String(100), nullable=False)
    total_chapters = Column(Integer, nullable=True)
    weightage = Column(Numeric(5, 2), nullable=True)
    standard_id = Column("std_id", BigInteger, ForeignKey('xxed_standards_tab.std_id'), nullable=True)

    # Compatibility property
    @property
    def is_active(self) -> bool:
        return True

    standard = relationship("Standard", back_populates="subjects")
    chapters = relationship("Chapter", back_populates="subject")
    academic_questions = relationship("AcademicQuestion", back_populates="subject")
    syllabus_progress = relationship("SyllabusProgress", back_populates="subject")
