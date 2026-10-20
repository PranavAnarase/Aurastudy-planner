from sqlalchemy import Column, BigInteger, SmallInteger, String, ForeignKey, Boolean, TIMESTAMP, text
from sqlalchemy.orm import relationship
from .base import Base

class Standard(Base):
    __tablename__ = 'xxed_standards_tab'

    standard_id = Column("std_id", BigInteger, primary_key=True, autoincrement=True)
    course_id = Column(BigInteger, ForeignKey('xxed_courses_tab.course_id'), nullable=False)
    standard_code = Column(String(50), nullable=False, unique=True)
    standard_name = Column(String(100), nullable=False)
    standard_number = Column(SmallInteger, nullable=True)
    is_active = Column(Boolean, nullable=False, server_default=text('1'))
    created_at = Column(TIMESTAMP, nullable=False, server_default=text('CURRENT_TIMESTAMP'))
    updated_at = Column(TIMESTAMP, nullable=False, server_default=text('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'))

    course = relationship("Course", back_populates="standards")
    subjects = relationship("Subject", back_populates="standard")
    student_profiles = relationship("StudentProfile", back_populates="standard")
    syllabus_progress = relationship("SyllabusProgress", back_populates="standard")
