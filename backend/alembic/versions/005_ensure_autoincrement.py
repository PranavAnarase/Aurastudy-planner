"""ensure_autoincrement_on_operational_tables

Revision ID: 005
Revises: 004
Create Date: 2026-09-25 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '005'
down_revision: Union[str, None] = '004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Set AUTO_INCREMENT on operational tables if they exist
    tables = [
        ("xxed_user_assessment_data", "user_ass_id"),
        ("xxed_user_answer_data", "user_answer_id"),
        ("xxed_chapter_mastery_tab", "chapter_mastery_id"),
        ("xxed_daily_plan_tasks_tab", "task_id"),
        ("xxed_syllabus_progress_tab", "progress_id"),
    ]
    try:
        op.execute("SET FOREIGN_KEY_CHECKS = 0;")
        for tbl, col in tables:
            try:
                op.execute(f"ALTER TABLE `{tbl}` MODIFY COLUMN `{col}` INT NOT NULL AUTO_INCREMENT;")
            except Exception:
                pass
    finally:
        try:
            op.execute("SET FOREIGN_KEY_CHECKS = 1;")
        except Exception:
            pass


def downgrade() -> None:
    pass
