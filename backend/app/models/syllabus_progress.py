from sqlalchemy import Column, BigInteger, Integer, Date, ForeignKey, TIMESTAMP, text
from sqlalchemy.orm import relationship
from .base import Base

class SyllabusProgress(Base):
    __tablename__ = 'xxed_syllabus_progress_tab'

    progress_id = Column(BigInteger, primary_key=True, autoincrement=True)
    standard_id = Column(BigInteger, ForeignKey('xxed_standards_tab.std_id'), nullable=False)
    subject_id = Column(Integer, ForeignKey('xxed_subjects_data.subject_id'), nullable=False)
    last_taught_chapter_number = Column(Integer, nullable=False, server_default=text('0'))
    as_of_date = Column(Date, nullable=False)
    updated_at = Column(TIMESTAMP, nullable=False, server_default=text('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'))

    standard = relationship("Standard", back_populates="syllabus_progress")
    subject = relationship("Subject", back_populates="syllabus_progress")
