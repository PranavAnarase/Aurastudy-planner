import asyncio
import httpx
from app.main import app

async def main():
    print("=== Testing FastAPI App with Live new_study_planner Database ===")
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Health check
        res = await client.get("/")
        print(f"1. GET / -> Status {res.status_code}: {res.json()}")
        assert res.status_code == 200

        # 2. Student Profile
        res = await client.get("/onboarding/student/2")
        print(f"2. GET /onboarding/student/2 -> Status {res.status_code}")
        assert res.status_code == 200
        data_student = res.json()
        print(f"   Student: {data_student.get('first_name')} {data_student.get('last_name')}, Standard: {data_student.get('standard_number')}, Times: {data_student.get('preferred_study_start_time')} - {data_student.get('preferred_study_end_time')}")

        # 3. Progress Subjects Summary
        res = await client.get("/progress/subjects/2")
        print(f"3. GET /progress/subjects/2 -> Status {res.status_code}")
        assert res.status_code == 200
        subjects_data = res.json()
        subject_list = subjects_data.get("subjects", [])
        print(f"   Subjects returned: {len(subject_list)}")
        for s in subject_list[:3]:
            print(f"   - {s.get('subject_name')}: mastery={s.get('subject_mastery')}%, tier={s.get('tier')}, unlocked={s.get('unlocked')}/{s.get('total')}")

        # 4. Progress Due Chapters Queue
        res = await client.get("/progress/due-chapters?student_id=2")
        print(f"4. GET /progress/due-chapters?student_id=2 -> Status {res.status_code}")
        assert res.status_code == 200
        due_data = res.json()
        print(f"   Due chapters count: {len(due_data.get('due_chapters', []))}")

        # 5. Diagnostic Report
        res = await client.get("/diagnostic/1/report")
        print(f"5. GET /diagnostic/1/report -> Status {res.status_code}")
        assert res.status_code == 200
        rep_data = res.json()
        print(f"   Session 1 Report: academic_accuracy={rep_data.get('academic_accuracy')}%, aptitude_score={rep_data.get('aptitude_score')}%, study_health={rep_data.get('study_health_score')}")

        # 6. Attempted Subjects
        res = await client.get("/diagnostic/student/2/attempted-subjects")
        print(f"6. GET /diagnostic/student/2/attempted-subjects -> Status {res.status_code}")
        assert res.status_code == 200
        print(f"   Attempted Subjects: {res.json()}")

        # 7. Daily Planner Generation
        res = await client.post("/planner/daily", json={
            "student_id": 2,
            "plan_date": "2026-09-24",
            "algorithm": "knapsack"
        })
        print(f"7. POST /planner/daily -> Status {res.status_code}")
        assert res.status_code == 200
        daily_plan = res.json()
        print(f"   Generated {len(daily_plan.get('tasks', []))} tasks for {daily_plan.get('plan_date')}:")
        for t in daily_plan.get('tasks', [])[:4]:
            print(f"   - Task #{t.get('task_id')}: '{t.get('chapter_name')}' ({t.get('subject_name')}) -> {t.get('allocated_minutes')} mins [{t.get('start_time')} - {t.get('end_time')}]")

    print("\nALL LIVE ENDPOINTS RETURNED 200 OK AGAINST new_study_planner DATABASE!")

if __name__ == "__main__":
    asyncio.run(main())
