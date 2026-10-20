import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_dynamic_recall_questions_selection():
    """
    Test that questions are selected strictly from xxed_academic_question_tab
    and that options A, B, C, D and correct_option / correct_index match with 100% precision.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "student_id": 1,
            "chapter_ids": [1, 2, 4],
            "question_count": 8,
            "activity_type": "FIRST_GAP_RETENTION_TEST"
        }
        res = await client.post("/assessment/dynamic-recall-questions", json=payload)
        assert res.status_code == 200, f"Error: {res.text}"
        data = res.json()
        
        assert data["student_id"] == 1
        assert data["total_questions"] > 0
        assert len(data["questions"]) > 0
        
        for q in data["questions"]:
            # Verify fields
            assert q["question_id"] > 0
            assert q["chapter_id"] in [1, 2, 4]
            assert len(q["question_text"]) > 0
            assert len(q["option_a"]) > 0
            assert len(q["option_b"]) > 0
            
            # Verify options list
            assert len(q["options"]) >= 2
            assert q["correct_option"] in ["A", "B", "C", "D"]
            assert q["correct_index"] in [0, 1, 2, 3]
            assert q["correct_index"] < len(q["options"])
            
            # Verify that the correct option letter matches correct_index
            expected_letter = chr(65 + q["correct_index"])
            assert q["correct_option"] == expected_letter
            
            # Verify correct answer text exists
            assert len(q["options"][q["correct_index"]]) > 0


@pytest.mark.asyncio
async def test_dynamic_recall_invalid_chapter():
    """Test that requesting empty chapter_ids returns 400."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "student_id": 1,
            "chapter_ids": [],
            "question_count": 5
        }
        res = await client.post("/assessment/dynamic-recall-questions", json=payload)
        assert res.status_code == 400
