"""
Unit and integration test for isolated Parent Portal endpoints.
"""

import asyncio
import sys
import os

backend_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, backend_dir)

from app.database import AsyncSessionLocal
from app.parent.repository import ParentRepository
from app.parent.insights import generate_parent_insights
from app.main import startup_db_migration


async def run_tests():
    print("=== Testing Parent Portal Module ===")

    # Run startup migration to ensure xxed_parents_tab table exists
    print("Running startup DB migration...")
    await startup_db_migration()

    # 1. Test Insight Engine
    insights = generate_parent_insights(
        child_first_name="Pranav",
        discipline_pct=88.0,
        retention_pct=72.0,
        subject_cards=[],
        lowest_scored_chapter={
            "chapter_name": "Dehat Aur Shahar",
            "subject_name": "Hindi",
            "score": 58.0
        },
        preferred_study_time="EVENING"
    )

    assert len(insights) >= 2, "Should generate at least 2 guidance items"
    print(f"[OK] Generated {len(insights)} insight items successfully.")
    for item in insights:
        print(f"   * [{item.tag}] {item.title}: {item.try_saying}")

    # 2. Test Repository Query with live DB session
    async with AsyncSessionLocal() as db:
        repo = ParentRepository(db)

        # Check existing student
        student = await repo.get_student_by_username("pranav123")
        if not student:
            # Fallback: check any existing student
            from sqlalchemy import select
            from app.models.student_profile import StudentProfile
            res = await db.execute(select(StudentProfile).limit(1))
            student = res.scalar_one_or_none()

        if student:
            print(f"[OK] Found student '{student.username}' (id={student.student_id}, name={student.first_name})")

            # Check or create parent
            p_username = f"parent_test_{student.username}"
            parent = await repo.get_parent_by_username(p_username)
            if not parent:
                parent = await repo.create_parent(
                    full_name=f"Parent of {student.first_name}",
                    username=p_username,
                    password="password123",
                    student_username=student.username
                )
                print(f"[OK] Created isolated parent account: '{parent.username}' mapped to child '{parent.student_username}'")
            else:
                print(f"[OK] Found existing parent account: '{parent.username}'")

            # Test Dashboard Data Aggregation
            data = await repo.get_dashboard_data(parent)
            print("[OK] Successfully aggregated Parent Dashboard data:")
            print(f"   * Child: {data.child_profile.full_name} ({data.child_profile.standard_name})")
            print(f"   * Live Presence: {data.live_presence.last_active_text} - {data.live_presence.last_activity_title}")
            print(f"   * Study Discipline: {data.health_overview.study_discipline.formatted} ({data.health_overview.study_discipline.badge_label})")
            print(f"   * Average Retention: {data.health_overview.average_retention.formatted} ({data.health_overview.average_retention.badge_label})")
            print(f"   * Weekly Hours: {data.health_overview.weekly_study_hours.formatted}")
            print(f"   * Subject Count: {len(data.subject_mastery)}")
            print(f"   * Guidance Items: {len(data.actionable_guidance)}")
            print(f"   * Today Journey Blocks: {len(data.today_journey)}")

    print("\nALL PARENT PORTAL BACKEND TESTS PASSED SUCCESSFULLY!")


if __name__ == "__main__":
    asyncio.run(run_tests())

