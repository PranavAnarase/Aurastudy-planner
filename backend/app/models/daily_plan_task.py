from sqlalchemy import Column, BigInteger, Integer, Date, ForeignKey, Enum, TIMESTAMP
from sqlalchemy.orm import relationship
from .base import Base
import enum

class TaskStatusEnum(str, enum.Enum):
    PENDING = 'PENDING'
    COMPLETED = 'COMPLETED'
    IN_PROGRESS = 'IN_PROGRESS'
    SKIPPED = 'SKIPPED'

class DailyPlanTask(Base):
    __tablename__ = 'xxed_daily_plan_tasks_tab'

    task_id = Column(BigInteger, primary_key=True, autoincrement=True)
    student_id = Column(BigInteger, ForeignKey('xxed_user_profile_tab.user_id', ondelete='CASCADE'), nullable=False)
    plan_date = Column(Date, nullable=False)
    chapter_id = Column(Integer, ForeignKey('xxed_chapters_data.chapter_id', ondelete='CASCADE'), nullable=False)
    allocated_minutes = Column(Integer, nullable=False)
    status = Column(Enum(TaskStatusEnum), nullable=False, server_default='PENDING')
    carried_forward_from_task_id = Column(BigInteger, ForeignKey('xxed_daily_plan_tasks_tab.task_id', ondelete='SET NULL'), nullable=True)
    completed_at = Column(TIMESTAMP, nullable=True)

    student = relationship("StudentProfile", back_populates="daily_plan_tasks")
    chapter = relationship("Chapter", back_populates="daily_plan_tasks")
    carried_forward_from = relationship("DailyPlanTask", remote_side=[task_id])
