from sqlalchemy import Column, BigInteger, String, Numeric, ForeignKey, Date, Enum, TIMESTAMP, text, Time, JSON
from sqlalchemy.orm import relationship
from .base import Base
import enum

class MediumEnum(str, enum.Enum):
    English = 'English'
    Marathi = 'Marathi'
    Hindi = 'Hindi'

class StudyGoalEnum(str, enum.Enum):
    EXAM_PREPARATION = 'EXAM_PREPARATION'
    SKILL_BUILDING = 'SKILL_BUILDING'
    GENERAL_LEARNING = 'GENERAL_LEARNING'

class PreferredStudyTimeEnum(str, enum.Enum):
    MORNING = 'MORNING'
    AFTERNOON = 'AFTERNOON'
    EVENING = 'EVENING'
    NIGHT = 'NIGHT'

class RevisionPreferenceEnum(str, enum.Enum):
    DAILY = 'DAILY'
    WEEKLY = 'WEEKLY'
    BOTH = 'BOTH'

class StudentProfile(Base):
    __tablename__ = 'xxed_user_profile_tab'

    # Primary key mapped from user_id to student_id for backwards compatibility
    student_id = Column("user_id", BigInteger, primary_key=True, autoincrement=True)
    standard_id = Column("standard_id", BigInteger, ForeignKey('xxed_standards_tab.std_id'), nullable=False)

    medium = Column(Enum(MediumEnum), nullable=False, server_default='English')
    study_goal = Column(Enum(StudyGoalEnum), nullable=False)
    daily_study_hours = Column(Numeric(4, 2), nullable=False)
    preferred_study_time = Column(Enum(PreferredStudyTimeEnum), nullable=False)
    revision_preference = Column(Enum(RevisionPreferenceEnum), nullable=False)

    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    username = Column(String(100), unique=True, nullable=True)
    password = Column(String(255), nullable=True)
    date_of_birth = Column(Date, nullable=True)
    school_name = Column(String(255), nullable=True)
    _study_start_time = Column("preferred_study_start_time", Time, nullable=True)
    _study_end_time = Column("preferred_study_end_time", Time, nullable=True)

    @property
    def preferred_study_start_time(self) -> str | None:
        if self._study_start_time:
            if hasattr(self._study_start_time, 'strftime'):
                return self._study_start_time.strftime("%H:%M")
            return str(self._study_start_time)[:5]
        return None

    @preferred_study_start_time.setter
    def preferred_study_start_time(self, val):
        self._study_start_time = val

    @property
    def preferred_study_end_time(self) -> str | None:
        if self._study_end_time:
            if hasattr(self._study_end_time, 'strftime'):
                return self._study_end_time.strftime("%H:%M")
            return str(self._study_end_time)[:5]
        return None

    @preferred_study_end_time.setter
    def preferred_study_end_time(self, val):
        self._study_end_time = val
    academic_year_start_date = Column(Date, nullable=False)
    academic_year_end_date = Column(Date, nullable=False)
    commitments_schedule = Column(JSON, nullable=True)

    created_at = Column(TIMESTAMP, nullable=False, server_default=text('CURRENT_TIMESTAMP'))
    updated_at = Column(TIMESTAMP, nullable=False, server_default=text('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'))

    @property
    def board_id(self) -> int:
        return 1

    @board_id.setter
    def board_id(self, val):
        pass

    standard = relationship("Standard", back_populates="student_profiles")
    chapter_mastery = relationship("ChapterMastery", back_populates="student")
    daily_plan_tasks = relationship("DailyPlanTask", back_populates="student")
