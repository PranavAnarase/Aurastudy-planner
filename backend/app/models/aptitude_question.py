from sqlalchemy import Column, BigInteger, String, Text, Numeric, Boolean, TIMESTAMP, text
from .base import Base

class AptitudeQuestion(Base):
    __tablename__ = 'xxed_aptitude_question_tab'

    aptitude_question_id = Column(BigInteger, primary_key=True, autoincrement=True)
    aptitude_slab = Column(String(20), nullable=False, server_default='5-7')
    category = Column(String(100), nullable=False)
    topic = Column(String(150), nullable=False)
    difficulty = Column("complexity", String(50), nullable=False)
    question_text = Column(Text, nullable=False)
    option_a = Column(Text, nullable=False)
    option_b = Column(Text, nullable=False)
    option_c = Column(Text, nullable=False)
    option_d = Column(Text, nullable=False)
    correct_option = Column(String(1), nullable=False)
    correct_answer_text = Column(Text, nullable=True)
    marks = Column(Numeric(5, 2), nullable=False, server_default=text('1.00'))
    is_active = Column(Boolean, nullable=False, server_default=text('1'))
    created_at = Column(TIMESTAMP, nullable=False, server_default=text('CURRENT_TIMESTAMP'))
    updated_at = Column(TIMESTAMP, nullable=False, server_default=text('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'))

    @property
    def estimated_time_seconds(self) -> int:
        return 60

    @property
    def question_code(self) -> str:
        return f"APT_{self.aptitude_question_id}"

    @property
    def explanation(self) -> str:
        return self.correct_answer_text or ""
