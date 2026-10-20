"""
SQLAlchemy model for isolated parent table (xxed_parents_tab).
Zero modifications to existing student profile table.
"""

from sqlalchemy import Column, String, TIMESTAMP, text
from .base import Base


class Parent(Base):
    __tablename__ = 'xxed_parents_tab'
    __table_args__ = {'extend_existing': True}

    id = Column(String(36), primary_key=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(100), nullable=False)
    student_username = Column(String(100), nullable=False, index=True)
    created_at = Column(TIMESTAMP, nullable=False, server_default=text('CURRENT_TIMESTAMP'))
