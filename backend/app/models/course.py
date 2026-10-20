from sqlalchemy import Column, BigInteger, String, Boolean, TIMESTAMP, text
from sqlalchemy.orm import relationship
from .base import Base

class Course(Base):
    __tablename__ = 'xxed_courses_tab'

    course_id = Column(BigInteger, primary_key=True, autoincrement=True)
    course_code = Column(String(30), nullable=False, unique=True)
    course_name = Column(String(100), nullable=False, unique=True)
    is_active = Column(Boolean, nullable=False, server_default=text('1'))
    created_at = Column(TIMESTAMP, nullable=False, server_default=text('CURRENT_TIMESTAMP'))
    updated_at = Column(TIMESTAMP, nullable=False, server_default=text('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'))

    standards = relationship("Standard", back_populates="course")

    @property
    def board_id(self):
        return self.course_id

    @board_id.setter
    def board_id(self, val):
        self.course_id = val

    @property
    def board_code(self):
        return self.course_code

    @property
    def board_name(self):
        return self.course_name
