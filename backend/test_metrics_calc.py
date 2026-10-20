import asyncio
import sys
import os

backend_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, backend_dir)

from app.database import AsyncSessionLocal
from sqlalchemy import text
from datetime import date, timedelta

async def test_calc():
    async with AsyncSessionLocal() as db:
        res_studs = await db.execute(text("SELECT user_id, username, first_name, daily_study_hours FROM xxed_user_profile_tab"))
        students = res_studs.fetchall()
        
        for s in students:
            sid, uname, fname, daily_hrs = s
            daily_target = float(daily_hrs or 2.0)
            weekly_target = round(daily_target * 7, 1)
            
            # 1. Tasks
            r_tasks = await db.execute(text("SELECT task_id, plan_date, allocated_minutes, status, completed_at FROM xxed_daily_plan_tasks_tab WHERE student_id = :sid"), {"sid": sid})
            tasks = r_tasks.fetchall()
            
            total_tasks = len(tasks)
            completed_tasks = [t for t in tasks if str(t[3]).upper() == 'COMPLETED']
            completed_task_mins = sum(t[2] for t in completed_tasks)
            
            # 2. Mastery stages
            r_mast = await db.execute(text("SELECT chapter_id, xxed_concept_completed, xxed_practice_completed, xxed_recall_completed, xxed_current_stage, last_assessed_at FROM xxed_chapter_mastery_tab WHERE user_id = :sid"), {"sid": sid})
            mast = r_mast.fetchall()
            
            mastery_stages_count = 0
            mastery_mins = 0
            for m in mast:
                stages = (1 if m[1] else 0) + (1 if m[2] else 0) + (1 if m[3] else 0) + (1 if m[4] == 'COMPLETED' else 0)
                mastery_stages_count += stages
                mastery_mins += stages * 35  # ~35 mins average study per completed stage
                
            # 3. Assessments
            r_ass = await db.execute(text("SELECT user_ass_id, time_taken, result_status, ass_end_time FROM xxed_user_assessment_data WHERE user_id = :sid AND result_status = 'COMPLETED'"), {"sid": sid})
            assessments = r_ass.fetchall()
            ass_mins = sum(max(15, (a[1] or 0) // 60) for a in assessments)
            
            # 4. Dynamic Recall
            r_drc = await db.execute(text("SELECT completion_id, time_taken_seconds FROM xxed_dynamic_recall_completions WHERE student_id = :sid"), {"sid": sid})
            drcs = r_drc.fetchall()
            drc_mins = sum(max(10, (d[1] or 0) // 60) for d in drcs)
            
            # Combined
            total_activity_count = len(completed_tasks) + mastery_stages_count + len(assessments) + len(drcs)
            total_completed_mins = completed_task_mins + (mastery_mins if len(completed_tasks) == 0 else 0) + ass_mins + drc_mins
            total_completed_hours = round(total_completed_mins / 60.0, 1)
            
            # Discipline calculation
            if total_tasks > 0:
                effective_completed = len(completed_tasks)
                if effective_completed == 0 and total_activity_count > 0:
                    effective_completed = min(total_tasks, total_activity_count)
                discipline_pct = round((effective_completed / total_tasks) * 100.0, 1)
                disc_expl = f"Completed {effective_completed} of {total_tasks} planned study sessions"
            else:
                discipline_pct = min(100.0, round((total_completed_hours / max(0.1, weekly_target)) * 100.0, 1)) if total_completed_hours > 0 else 0.0
                disc_expl = f"{total_activity_count} learning sessions recorded" if total_activity_count > 0 else "Study tasks will record discipline automatically"
                
            print(f"\nStudent {fname} (@{uname}):")
            print(f"  Tasks: {len(completed_tasks)} / {total_tasks} completed ({completed_task_mins} mins)")
            print(f"  Mastery stages completed: {mastery_stages_count} ({mastery_mins} mins)")
            print(f"  Assessments completed: {len(assessments)} ({ass_mins} mins)")
            print(f"  Dynamic recall completed: {len(drcs)} ({drc_mins} mins)")
            print(f"  => Total Study Hours: {total_completed_hours} hrs / {weekly_target} hrs")
            print(f"  => Study Discipline: {discipline_pct}% ({disc_expl})")

asyncio.run(test_calc())
