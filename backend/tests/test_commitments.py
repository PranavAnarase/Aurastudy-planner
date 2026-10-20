import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_commitments_persistence_flow():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Update commitments for student 1
        sample_commitments = [
            {
                "id": "comm-college-1",
                "label": "College",
                "recurrence_type": "WEEKLY_RECURRING",
                "days_of_week": ["MON", "TUE", "WED", "THU", "FRI"],
                "specific_date": None,
                "start_time": "09:00",
                "end_time": "13:00",
                "color": "#6366f1"
            },
            {
                "id": "comm-sports-2",
                "label": "Sports/Activity",
                "recurrence_type": "WEEKLY_RECURRING",
                "days_of_week": ["SAT", "SUN"],
                "specific_date": None,
                "start_time": "16:00",
                "end_time": "18:00",
                "color": "#10b981"
            },
            {
                "id": "comm-event-3",
                "label": "Other",
                "recurrence_type": "SPECIFIC_DATE",
                "days_of_week": [],
                "specific_date": "2026-10-15",
                "start_time": "10:00",
                "end_time": "12:00",
                "color": "#f59e0b"
            }
        ]

        put_res = await ac.put("/planner/commitments/1", json={"commitments": sample_commitments})
        assert put_res.status_code == 200, put_res.text
        put_data = put_res.json()
        assert len(put_data["commitments"]) == 3
        assert put_data["commitments"][0]["label"] == "College"
        assert put_data["commitments"][0]["days_of_week"] == ["MON", "TUE", "WED", "THU", "FRI"]
        assert put_data["commitments"][1]["days_of_week"] == ["SAT", "SUN"]
        assert put_data["commitments"][2]["specific_date"] == "2026-10-15"

        # 2. Get commitments for student 1 and verify persistence
        get_res = await ac.get("/planner/commitments/1")
        assert get_res.status_code == 200
        get_data = get_res.json()
        assert len(get_data["commitments"]) == 3
        assert get_data["commitments"][0]["id"] == "comm-college-1"
        assert get_data["commitments"][1]["id"] == "comm-sports-2"
        assert get_data["commitments"][2]["id"] == "comm-event-3"
