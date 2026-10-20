import urllib.request
import json

headers = {
    "Content-Type": "application/json"
}

# 1. Test Daily Planner
url_daily = "http://127.0.0.1:8001/planner/daily"
payload_daily = {
    "student_id": 4,
    "plan_date": "2026-08-12",
    "strategy": "knapsack",
    "force_regenerate": False  # Let self-healing detect it!
}
req_daily = urllib.request.Request(url_daily, data=json.dumps(payload_daily).encode('utf-8'), headers=headers, method="POST")

try:
    with urllib.request.urlopen(req_daily) as response:
        res_body = response.read().decode('utf-8')
        data = json.loads(res_body)
        print("DAILY PLANNER RESPONSE:")
        daily_subjects = set(t["subject_name"] for t in data.get("tasks", []))
        tasks_str = ", ".join([f"{t['subject_name']}: {t['chapter_name']}" for t in data.get("tasks", [])])
        print(f"Tasks: {tasks_str}")
        print(f"Scheduled daily subjects: {list(daily_subjects)}")
except urllib.error.HTTPError as e:
    print(f"DAILY PLANNER HTTP Error {e.code}: {e.read().decode('utf-8')}")

print("-" * 50)

# 2. Test Weekly Planner
url_weekly = "http://127.0.0.1:8001/planner/weekly"
payload_weekly = {
    "student_id": 4
}
req_weekly = urllib.request.Request(url_weekly, data=json.dumps(payload_weekly).encode('utf-8'), headers=headers, method="POST")

try:
    with urllib.request.urlopen(req_weekly) as response:
        res_body = response.read().decode('utf-8')
        data = json.loads(res_body)
        print("WEEKLY PLANNER RESPONSE:")
        weekly_subjects = set()
        for day in data.get("days", []):
            for t in day.get("tasks", []):
                weekly_subjects.add(t["subject_name"])
            day_tasks_str = ", ".join([f"{t['subject_name']}: {t['chapter_name']}" for t in day.get("tasks", [])])
            print(f"Day {day['day_number']}: {day_tasks_str}")
        print(f"\nScheduled weekly subjects: {list(weekly_subjects)}")
except urllib.error.HTTPError as e:
    print(f"WEEKLY PLANNER HTTP Error {e.code}: {e.read().decode('utf-8')}")
