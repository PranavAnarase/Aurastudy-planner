"""
Groq AI Post-Assessment High-Depth Contrastive Diagnostics Engine.
Strictly Isolated Scope: Pure pedagogical tutor role.
Generates contrastive post-test explanations, micro-concept gaps, memory formulas, and attempt summaries.
Zero influence on scheduling, timetables, or mastery calculations.
Zero external package dependencies (uses Python standard library urllib.request + asyncio).
"""

import os
import json
import logging
import urllib.request
import urllib.error
import asyncio
from typing import Dict, List, Any, Optional
from app.config import settings

logger = logging.getLogger(__name__)

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.3-70b-versatile"

ENHANCED_GRADE7_SYSTEM_PROMPT = """
You are an expert, encouraging Standard 7 school tutor. 
Your goal is to provide deep, clear, and actionable feedback for missed test questions.

STRICT INSTRUCTIONS FOR EVERY MISSED QUESTION:
1. "conceptGap": Identify the exact micro-concept (e.g., "Confusing Material Sources with Written Sources", NOT a broad topic title).
2. "misconceptionExplanation": Write a 2-3 sentence contrastive explanation:
   - Sentence 1: Quote or reference what their choice claimed and explain why it is a misconception.
   - Sentence 2-3: Explain why the correct option is true using simple Standard 7 real-life examples (mention specific examples like forts, monuments, coins, or daily life).
3. "memoryTip": Provide a concrete, memorable mental formula, mnemonic, or classification hook.
   - BANNED: "Check the definitions", "Study hard", "Review chapter notes".
   - REQUIRED: Actionable rules like "Forts, Coins, Stupas = Material | Biographies, Letters = Written | Powadas, Songs = Oral".

OUTPUT FORMAT:
Return strictly valid JSON matching this schema:
{
  "overallSummary": "2-3 encouraging sentences highlighting the student's strong areas and the specific concept to revisit.",
  "diagnoses": [
    {
      "questionId": 101,
      "conceptGap": "Classification of Material Sources of History",
      "misconceptionExplanation": "You selected that buildings only offer aesthetic value. In history, physical structures like forts, palaces, and monuments are crucial 'Material Sources'—they reveal the architectural engineering, economic wealth, and lifestyle of the period they were built in.",
      "memoryTip": "If you can touch it (Forts, Coins, Monuments), it is a Material Source. If you read it, it is Written!"
    }
  ]
}
"""


class GroqAssessmentDiagnosticService:
    @staticmethod
    def _get_api_key() -> str:
        raw_key = settings.groq_api_key or os.environ.get("GROQ_API_KEY", "")
        return raw_key.strip().strip('"').strip("'")

    @classmethod
    async def generate_diagnostic_feedback(
        cls,
        subject_name: str,
        chapter_name: str,
        accuracy: float,
        obtained_marks: float,
        total_marks: float,
        questions_data: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Main entry point for generating post-assessment contrastive AI diagnostics.
        Returns:
            {
                "ai_overall_summary": str,
                "question_diagnostics": Dict[int, Dict[str, Optional[str]]]
            }
        """
        api_key = cls._get_api_key()
        
        # If API key is available and valid, attempt to query Groq LLM
        if api_key and api_key != "your_groq_api_key_here":
            try:
                result = await cls._call_groq_llm(
                    api_key=api_key,
                    subject_name=subject_name,
                    chapter_name=chapter_name,
                    accuracy=accuracy,
                    obtained_marks=obtained_marks,
                    total_marks=total_marks,
                    questions_data=questions_data
                )
                if result:
                    return result
            except Exception as e:
                logger.warning(f"Groq API call failed, using graceful fallback: {e}")

        # Graceful contrastive fallback heuristic
        return cls._generate_heuristic_fallback(
            subject_name=subject_name,
            chapter_name=chapter_name,
            accuracy=accuracy,
            obtained_marks=obtained_marks,
            total_marks=total_marks,
            questions_data=questions_data
        )

    @classmethod
    async def _call_groq_llm(
        cls,
        api_key: str,
        subject_name: str,
        chapter_name: str,
        accuracy: float,
        obtained_marks: float,
        total_marks: float,
        questions_data: List[Dict[str, Any]]
    ) -> Optional[Dict[str, Any]]:
        return await asyncio.to_thread(
            cls._sync_call_groq,
            api_key,
            subject_name,
            chapter_name,
            accuracy,
            obtained_marks,
            total_marks,
            questions_data
        )

    @classmethod
    def _sync_call_groq(
        cls,
        api_key: str,
        subject_name: str,
        chapter_name: str,
        accuracy: float,
        obtained_marks: float,
        total_marks: float,
        questions_data: List[Dict[str, Any]]
    ) -> Optional[Dict[str, Any]]:
        # Format incorrect / skipped items with full option texts
        formatted_questions = []
        for item in questions_data:
            if not item.get("is_correct", False):
                options = item.get("options", {})
                sel_letter = (item.get("selected_option") or "").strip().upper()
                cor_letter = (item.get("correct_option") or "").strip().upper()

                sel_text = options.get(sel_letter) or item.get("selected_option_text") or (f"Option {sel_letter}" if sel_letter else "Skipped")
                cor_text = options.get(cor_letter) or item.get("correct_option_text") or f"Option {cor_letter}"

                formatted_questions.append({
                    "questionId": item["question_id"],
                    "questionText": item["question_text"],
                    "studentChoiceLetter": sel_letter or "SKIPPED",
                    "studentChoiceText": sel_text,
                    "correctChoiceLetter": cor_letter,
                    "correctChoiceText": cor_text,
                    "standardExplanation": item.get("explanation", "")
                })

        groq_payload = {
            "subject": subject_name,
            "chapter": chapter_name,
            "scorePercentage": accuracy,
            "obtainedMarks": obtained_marks,
            "totalMarks": total_marks,
            "incorrectQuestions": formatted_questions
        }

        user_content = f"Generate detailed pedagogical feedback for these missed Grade 7 assessment items:\n{json.dumps(groq_payload, indent=2)}"

        payload = {
            "model": GROQ_MODEL,
            "messages": [
                {"role": "system", "content": ENHANCED_GRADE7_SYSTEM_PROMPT},
                {"role": "user", "content": user_content}
            ],
            "temperature": 0.3,
            "response_format": {"type": "json_object"},
            "max_tokens": 1800
        }

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        }

        req = urllib.request.Request(
            GROQ_API_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST"
        )

        try:
            with urllib.request.urlopen(req, timeout=10.0) as resp:
                resp_bytes = resp.read()
                data = json.loads(resp_bytes.decode("utf-8"))
                content = data["choices"][0]["message"]["content"]
                parsed = json.loads(content)

                diagnostics_map: Dict[int, Dict[str, Optional[str]]] = {}
                
                # Parse diagnoses array
                for item in parsed.get("diagnoses", []):
                    qid = item.get("questionId") or item.get("question_id")
                    if qid is not None:
                        diagnostics_map[int(qid)] = {
                            "ai_concept_gap": item.get("conceptGap") or item.get("ai_concept_gap"),
                            "ai_misconception_feedback": item.get("misconceptionExplanation") or item.get("ai_misconception_feedback"),
                            "ai_memory_tip": item.get("memoryTip") or item.get("ai_memory_tip")
                        }

                # Backfill correct questions with reinforcement
                for q in questions_data:
                    qid = q["question_id"]
                    if qid not in diagnostics_map:
                        corr = q.get("correct_option", "A")
                        expl = q.get("explanation") or f"Correct reasoning applied for Option {corr}."
                        diagnostics_map[qid] = {
                            "ai_concept_gap": None,
                            "ai_misconception_feedback": f"Mastered! {expl}",
                            "ai_memory_tip": "Key concept retention verified. Keep applying this rule in upcoming problem sets."
                        }

                overall_summary = parsed.get("overallSummary") or parsed.get("ai_overall_summary") or f"Great effort on {chapter_name}! Review the contrastive feedback below to master your targeted concepts."

                return {
                    "ai_overall_summary": overall_summary,
                    "question_diagnostics": diagnostics_map
                }
        except urllib.error.HTTPError as he:
            err_body = ""
            try:
                err_body = he.read().decode("utf-8")
            except Exception:
                pass
            logger.warning(f"Groq API HTTP Error {he.code}: {he.reason} - {err_body}")
            return None
        except Exception as e:
            logger.warning(f"Groq sync request failed: {e}")
            return None

    @classmethod
    def _generate_heuristic_fallback(
        cls,
        subject_name: str,
        chapter_name: str,
        accuracy: float,
        obtained_marks: float,
        total_marks: float,
        questions_data: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Pure deterministic fallback with contrastive Standard 7 explanations when Groq LLM is not reachable.
        """
        if accuracy >= 80.0:
            summary = f"Outstanding performance on {chapter_name} ({accuracy}% accuracy)! You have demonstrated solid command over the core definitions and problem sets."
        elif accuracy >= 50.0:
            summary = f"Good progress on {chapter_name} ({accuracy}% accuracy). Review the contrastive analysis below to eliminate distractor traps and solidify your mastery."
        else:
            summary = f"You scored {obtained_marks}/{total_marks} on {chapter_name}. Focus on the micro-concept formulas and memory hooks below to rebuild confidence in this topic."

        diagnostics_map: Dict[int, Dict[str, Optional[str]]] = {}

        for q in questions_data:
            qid = q["question_id"]
            is_corr = q.get("is_correct", False)
            sel = (q.get("selected_option") or "").strip().upper()
            corr = (q.get("correct_option") or "").strip().upper()
            options = q.get("options", {})
            sel_text = options.get(sel, f"Option {sel}" if sel else "Skipped")
            cor_text = options.get(corr, f"Option {corr}")
            expl = q.get("explanation") or f"Option {corr} ({cor_text}) is the established standard rule in Standard 7 {subject_name}."

            if is_corr:
                diagnostics_map[qid] = {
                    "ai_concept_gap": None,
                    "ai_misconception_feedback": f"Mastered! You correctly identified {cor_text}. {expl}",
                    "ai_memory_tip": f"Retain this core rule for {chapter_name} applications."
                }
            elif not sel:
                diagnostics_map[qid] = {
                    "ai_concept_gap": f"{chapter_name} Core Concept Identification",
                    "ai_misconception_feedback": f"This question was skipped. The correct answer is Option {corr}: '{cor_text}'. {expl}",
                    "ai_memory_tip": f"Memory Hook: In {subject_name}, associate {cor_text} directly with {chapter_name}."
                }
            else:
                diagnostics_map[qid] = {
                    "ai_concept_gap": f"{chapter_name} Distractor Analysis",
                    "ai_misconception_feedback": f"You selected Option {sel}: '{sel_text}', which is a common misconception. In Standard 7 {subject_name}, Option {corr}: '{cor_text}' is correct because {expl}",
                    "ai_memory_tip": f"Rule: '{cor_text}' applies whenever analyzing {chapter_name}."
                }

        return {
            "ai_overall_summary": summary,
            "question_diagnostics": diagnostics_map
        }
