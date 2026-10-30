"""
Algorithmic generator for actionable, compassionate parenting insights and conversation prompts.
Implements 5 Action Types (Continue, Practice, Revise, Assess, Prioritize) with subject-specific, natural phrasing.
"""

from typing import List, Dict, Any, Optional, Tuple
from app.parent.models import ActionableGuidanceItem, SubjectMasteryCard


# -----------------------------------------------------------------------------
# Subject-Aware Pedagogical Action & Prompt Generator
# Provides natural, conversational recommendations tailored to subject type
# (Languages vs Mathematics vs Science vs Geography vs History & Civics)
# -----------------------------------------------------------------------------

def get_subject_category(subject_name: str) -> str:
    """Categorizes a subject into 'language', 'math', 'science', 'geography', 'history', or 'general'."""
    name = (subject_name or "").lower()
    if any(k in name for k in ["english", "hindi", "हिंदी", "मराठी", "marathi", "sanskrit", "language", "grammar", "भाषा"]):
        return "language"
    elif any(k in name for k in ["math", "गणित", "algebra", "geometry", "arithmetic"]):
        return "math"
    elif any(k in name for k in ["science", "विज्ञान", "physics", "chemistry", "biology", "evs", "पर्यावरण"]):
        return "science"
    elif any(k in name for k in ["geography", "भूगोल", "earth"]):
        return "geography"
    elif any(k in name for k in ["history", "civics", "social", "इतिहास", "नागरिकशास्त्र"]):
        return "history"
    return "general"


def get_subject_pedagogical_guidance(
    subject_name: str,
    chapter_name: str,
    child_name: str,
    mastery_score: float,
    status_level: str
) -> Tuple[str, str, str, str, str]:
    """
    Returns: (action_text, action_type, why_reason, try_saying, situation)
    tailored specifically to the pedagogical nature of the subject.
    """
    cat = get_subject_category(subject_name)
    ch_disp = f'"{chapter_name}"' if chapter_name else f"this {subject_name} topic"
    score_int = int(round(mastery_score)) if mastery_score > 0 else 0

    # 1. Critical / Low Mastery (< 50%)
    if status_level == "low" or (0 < mastery_score < 50.0):
        if cat == "language":
            action = f"Spend 10–15 minutes reading through {ch_disp} with {child_name} to chat about the core story, characters, and tricky new words."
            why = f"Talking through the narrative and vocabulary in {ch_disp} ({score_int}% current score) builds strong reading comprehension confidence."
            prompt = f"Ask {child_name}: \"What was your favorite part or character in {ch_disp}? Let's check out a couple of new words from it together!\""
            return (action, "Prioritize", why, prompt, "Critical language chapter + vocabulary review")
        
        elif cat == "math":
            action = f"Sit with {child_name} for a friendly 10-minute scratchpad session to work through 2–3 step-by-step example problems from {ch_disp}."
            why = f"Breaking down calculations on paper clears up tricky formula points ({score_int}% current score) without feeling like a test."
            prompt = f"Ask {child_name}: \"Can you show me how you solve one problem from {ch_disp} on paper? Let's work through the steps together!\""
            return (action, "Prioritize", why, prompt, "Critical math chapter + calculation practice")

        elif cat == "science":
            action = f"Help {child_name} visualize the core ideas in {ch_disp} by connecting them to everyday real-world examples at home or in nature."
            why = f"Connecting scientific laws to real-life daily phenomena turns abstract ideas ({score_int}% current score) into intuitive understanding."
            prompt = f"Ask {child_name}: \"Can you explain how the science in {ch_disp} shows up in real life around our house or outside?\""
            return (action, "Prioritize", why, prompt, "Critical science chapter + real-world concept review")

        elif cat == "geography":
            action = f"Explore a map or globe together to help {child_name} easily picture the landforms, climate, and locations taught in {ch_disp}."
            why = f"Visualizing maps and regions helps cement geographical features ({score_int}% current score) much faster than memorizing text."
            prompt = f"Ask {child_name}: \"Where on the map do the physical features in {ch_disp} occur? Let's trace it together!\""
            return (action, "Prioritize", why, prompt, "Critical geography chapter + map visualization")

        elif cat == "history":
            action = f"Discuss {ch_disp} like an engaging bedtime story rather than memorizing isolated dates and dry facts."
            why = f"Storytelling brings historical timelines and governance ideas ({score_int}% current score) vividly to life for lasting recall."
            prompt = f"Ask {child_name}: \"What were the biggest events and challenges in {ch_disp}? Tell me the story behind it!\""
            return (action, "Prioritize", why, prompt, "Critical history chapter + storytelling review")

        else:
            action = f"Spend 10 quiet minutes checking in with {child_name} on {ch_disp} to clear up any confusing concepts together."
            why = f"A friendly check-in identifies confusing points early ({score_int}% current score) before moving to subsequent lessons."
            prompt = f"Ask {child_name}: \"Which part of {ch_disp} felt the most tricky today? Let's review it together without pressure.\""
            return (action, "Prioritize", why, prompt, "Critical chapter + conceptual review")

    # 2. Developing Mastery (50% - 79%)
    if status_level == "medium" or (50.0 <= mastery_score < 80.0):
        if cat == "language":
            action = f"Encourage {child_name} to read {ch_disp} aloud once or write a 3-sentence summary to build fluency and writing confidence."
            why = f"Active reading aloud cements vocabulary and sentence structure ({score_int}% current score) into fluent expression."
            prompt = f"Say to {child_name}: \"Can you read your favorite paragraph from {ch_disp} aloud to me? Your pronunciation and fluency are improving!\""
            return (action, "Practice", why, prompt, "Developing language chapter")

        elif cat == "math":
            action = f"Encourage {child_name} to complete a few timed practice drills in {ch_disp} to build problem-solving speed and accuracy."
            why = f"Regular problem-solving drills turn formula understanding ({score_int}% current score) into quick, reliable reflexes."
            prompt = f"Say to {child_name}: \"You understand the method in {ch_disp} well. Let's do 3 quick practice problems to build speed!\""
            return (action, "Practice", why, prompt, "Developing math problem-solving")

        elif cat == "science":
            action = f"Ask {child_name} to explain the key diagrams or scientific experiments from {ch_disp} in their own words over dinner."
            why = f"Explaining scientific diagrams aloud ({score_int}% current score) is the most effective active recall technique."
            prompt = f"Ask {child_name}: \"Can you walk me through the main diagram or experiment from {ch_disp}? I'd love to hear how it works!\""
            return (action, "Practice", why, prompt, "Developing science concepts")

        elif cat == "geography":
            action = f"Encourage {child_name} to review the key climate patterns and geographical definitions for {ch_disp} during study time."
            why = f"Reviewing definitions and map markers reinforces spatial understanding ({score_int}% current score)."
            prompt = f"Ask {child_name}: \"How does the climate or landscape in {ch_disp} shape how people live and work there?\""
            return (action, "Practice", why, prompt, "Developing geography concepts")

        elif cat == "history":
            action = f"Ask {child_name} to describe the key historical figures or governance rules from {ch_disp} during family chat."
            why = f"Explaining historical cause-and-effect ({score_int}% current score) cements ideas into long-term memory."
            prompt = f"Ask {child_name}: \"Why was that decision or event in {ch_disp} so important for society? What would you have done?\""
            return (action, "Practice", why, prompt, "Developing history concepts")

        else:
            action = f"Support {child_name} with dedicated quiet time to complete practice drills for {ch_disp}."
            why = f"Consistent practice drills build steady progress ({score_int}% current score) toward strong mastery."
            prompt = f"Say to {child_name}: \"You are making solid progress in {ch_disp}. Keep up the focused practice!\""
            return (action, "Practice", why, prompt, "Developing chapter")

    # 3. High Mastery (>= 80%)
    if status_level == "high" or mastery_score >= 80.0:
        if cat == "language":
            action = f"{child_name} has a strong command of {ch_disp}! Encourage reading an extra story or article to keep expanding vocabulary."
            why = f"High quiz score of {score_int}% reflects solid reading comprehension and clear expression."
            prompt = f"Say to {child_name}: \"You did an amazing job understanding {ch_disp}! Let's find another exciting story to read next.\""
            return (action, "Continue", why, prompt, "Mastered language chapter")

        elif cat == "math":
            action = f"{child_name} has mastered {ch_disp} with high calculation accuracy! Praise their effort and challenge them with a fun puzzle."
            why = f"Scored {score_int}% with accurate formula application and problem-solving execution."
            prompt = f"Say to {child_name}: \"Super impressed with your math accuracy in {ch_disp}! You really mastered this topic.\""
            return (action, "Continue", why, prompt, "Mastered math chapter")

        elif cat == "science":
            action = f"{child_name} shows great scientific clarity in {ch_disp}. Ask them to share one curious fact or experiment with the family."
            why = f"High assessment accuracy ({score_int}%) reflects strong comprehension of scientific principles."
            prompt = f"Say to {child_name}: \"You have a wonderful grasp of {ch_disp}! What was the coolest science fact you learned from it?\""
            return (action, "Continue", why, prompt, "Mastered science chapter")

        elif cat == "geography" or cat == "history":
            action = f"{child_name} has excellent recall of {ch_disp}. Connect what was learned to modern news and world events!"
            why = f"High retention score of {score_int}% demonstrates thorough comprehension of topics and timelines."
            prompt = f"Say to {child_name}: \"Your knowledge of {ch_disp} is fantastic! It's so interesting how that connects to our world today.\""
            return (action, "Continue", why, prompt, "Mastered social science chapter")

        else:
            action = f"{child_name} has thoroughly mastered {ch_disp} ({score_int}%). Praise their effort and encourage regular revision."
            why = f"High retention score of {score_int}% reflects solid conceptual mastery across tests."
            prompt = f"Say to {child_name}: \"Great effort on mastering {ch_disp}! Keep this wonderful momentum going.\""
            return (action, "Continue", why, prompt, "Mastered chapter")

    # 4. In Progress / Unassessed
    action = f"Encourage {child_name} to take the diagnostic quiz for {ch_disp} to benchmark retention and update their study plan."
    why = f"Taking the quiz will calibrate personalized revision schedules in AuraStudy."
    prompt = f"Say to {child_name}: \"Are you ready for a quick 10-minute quiz on {ch_disp}? It will lock in your score on the dashboard!\""
    return (action, "Assess", why, prompt, "Diagnostic Quiz Due")


def generate_parent_insights(
    child_first_name: str,
    discipline_pct: float,
    retention_pct: float,
    subject_cards: List[SubjectMasteryCard],
    lowest_scored_chapter: Dict[str, Any] | None = None,
    preferred_study_time: str = "EVENING"
) -> List[ActionableGuidanceItem]:
    """Generates 5-Action-Type classified parent recommendations with natural, subject-aware phrasing."""
    insights: List[ActionableGuidanceItem] = []
    child_name = child_first_name or "your child"

    # 1. Primary Academic Recommendation (Subject-Specific & Pedagogically Tailored)
    if lowest_scored_chapter and lowest_scored_chapter.get("chapter_name"):
        chap_name = lowest_scored_chapter["chapter_name"]
        subj_name = lowest_scored_chapter.get("subject_name", "Academic")
        score = float(lowest_scored_chapter.get("score", 60.0))
        status_lvl = "low" if score < 50.0 else ("medium" if score < 80.0 else "high")

        action_text, action_type, why_reason, try_saying, situation = get_subject_pedagogical_guidance(
            subject_name=subj_name,
            chapter_name=chap_name,
            child_name=child_name,
            mastery_score=score,
            status_level=status_lvl
        )

        insights.append(
            ActionableGuidanceItem(
                id="guidance-chapter-action",
                category="quiz_review",
                action_type=action_type,
                situation=situation,
                title=f"{subj_name}: {chap_name}",
                description=action_text,
                why_reason=why_reason,
                try_saying=try_saying,
                tag="Priority Focus" if action_type == "Prioritize" else ("Targeted Practice" if action_type == "Practice" else "Mastery Win"),
                subject_hint=subj_name
            )
        )
    else:
        # Check if one subject is weaker than others
        low_subject = None
        min_score = 101.0
        for s in subject_cards:
            if 0 < s.quiz_average_percentage < min_score:
                min_score = s.quiz_average_percentage
                low_subject = s

        if low_subject and min_score < 60.0:
            cat = get_subject_category(low_subject.subject_name)
            if cat == "math":
                action = f"Support {child_name} with dedicated math practice time this week, working through core step-by-step example problems."
                why = f"Mathematics average retention ({min_score:.0f}%) is trailing other subjects and benefits from scratchpad problem solving."
                prompt = f"Say to {child_name}: \"Let's spend 15 extra minutes on math together today to make formulas feel completely natural!\""
            elif cat == "language":
                action = f"Encourage {child_name} to spend 15 minutes reading {low_subject.subject_name} chapters aloud and reviewing vocabulary meanings."
                why = f"{low_subject.subject_name} average score is {min_score:.0f}%; regular reading aloud builds fluency and comprehension."
                prompt = f"Say to {child_name}: \"Let's read a short {low_subject.subject_name} passage together before dinner and discuss the new words.\""
            elif cat == "science":
                action = f"Help {child_name} connect {low_subject.subject_name} concepts to real-world examples to clear up difficult principles."
                why = f"{low_subject.subject_name} retention is at {min_score:.0f}%; hands-on visualization turns abstract science into clear understanding."
                prompt = f"Say to {child_name}: \"Which part of {low_subject.subject_name} feels the trickiest right now? Let's find a real-world example for it!\""
            else:
                action = f"Encourage {child_name} to allocate an extra 20-minute study slot to {low_subject.subject_name} this week."
                why = f"{low_subject.subject_name} retention is at {min_score:.0f}%, which is currently trailing behind other subjects."
                prompt = f"Say to {child_name}: \"Let's add a short daily focus session for {low_subject.subject_name} to give it a nice boost!\""

            insights.append(
                ActionableGuidanceItem(
                    id="guidance-subject-focus",
                    category="quiz_review",
                    action_type="Prioritize",
                    situation="One subject significantly weaker",
                    title=f"{low_subject.subject_name} Support Focus",
                    description=action,
                    why_reason=why,
                    try_saying=prompt,
                    tag="Subject Focus",
                    subject_hint=low_subject.subject_name
                )
            )
        elif retention_pct >= 80.0:
            insights.append(
                ActionableGuidanceItem(
                    id="guidance-assessment-high",
                    category="quiz_review",
                    action_type="Continue",
                    situation="Good assessment performance",
                    title="Assessment Performance Win",
                    description=f"{child_name} is performing exceptionally well across recent tests with an average retention of {retention_pct:.0f}%.",
                    why_reason=f"Scoring {retention_pct:.0f}% across assessments reflects strong concept retention and diligent study habits.",
                    try_saying=f"Say to {child_name}: \"Super proud of your strong quiz results! Your consistent daily preparation is really showing.\"",
                    tag="High Performance",
                    subject_hint="Academic Progress"
                )
            )
        else:
            insights.append(
                ActionableGuidanceItem(
                    id="guidance-diagnostic-check",
                    category="quiz_review",
                    action_type="Assess",
                    situation="Diagnostic calibration due",
                    title="Diagnostic Quiz Calibration",
                    description=f"Encourage {child_name} to complete any pending chapter quizzes so AuraStudy can accurately tune their weekly study plan.",
                    why_reason="Diagnostic test data updates spaced repetition intervals and adapts the daily study timetable.",
                    try_saying=f"Say to {child_name}: \"Let's take a quick 10-minute quiz tonight to check your retention and update your roadmap.\"",
                    tag="Check-In Due",
                    subject_hint="Study Calibration"
                )
            )

    # 2. Schedule consistency & habit building guidance
    time_label = "evening (6:00 – 8:30 PM)" if "EVENING" in preferred_study_time.upper() else "morning study"
    if discipline_pct >= 75.0:
        insights.append(
            ActionableGuidanceItem(
                id="guidance-consistency-win",
                category="consistency",
                action_type="Continue",
                situation="Study plan followed consistently",
                title="Schedule Consistency Win",
                description=f"{child_name} completed {discipline_pct:.0f}% of scheduled study sessions this week during {time_label}.",
                why_reason=f"High study discipline ({discipline_pct:.0f}%) builds strong learning habits and reduces exam-time cramming.",
                try_saying=f"Say to {child_name}: \"I noticed how focused and disciplined you were with your study schedule today. Really proud of you!\"",
                tag="Consistency Win",
                subject_hint="Habit Building"
            )
        )
    else:
        insights.append(
            ActionableGuidanceItem(
                id="guidance-consistency-nudge",
                category="consistency",
                action_type="Prioritize",
                situation="Study plan not being followed",
                title="Gentle Habit Check-In",
                description=f"{child_name} had a couple of missed study slots this week ({discipline_pct:.0f}% completed). A gentle check-in helps restore routine.",
                why_reason=f"Study discipline is currently at {discipline_pct:.0f}%; regular daily study blocks prevent last-minute backlogs.",
                try_saying=f"Say to {child_name}: \"Let's make sure your study desk is quiet, comfortable, and ready for your study slot tonight!\"",
                tag="Habit Building",
                subject_hint="Time Management"
            )
        )

    # 3. Rest & Protected Sleep Window
    insights.append(
        ActionableGuidanceItem(
            id="guidance-rest-balance",
            category="support_tip",
            action_type="Continue",
            situation="Protected sleep window active",
            title="Protected Sleep & Recovery Window",
            description=f"AuraStudy has protected the 10:00 PM – 06:00 AM window for deep sleep and memory consolidation.",
            why_reason="Uninterrupted 8-hour sleep consolidates neural connections formed during daytime study sessions.",
            try_saying=f"Say to {child_name}: \"Wind down 15 minutes before 10:00 PM without digital screens to wake up refreshed.\"",
            tag="Rest & Wellness",
            subject_hint="Healthy Routine"
        )
    )

    return insights


def generate_subject_home_tip(
    subject_name: str,
    mastery_score: float,
    status_level: str,
    chapters_completed: int,
    total_chapters: int,
    lowest_chapter_name: Optional[str] = None,
    child_first_name: str = "your child"
) -> Tuple[str, str, str]:
    """
    Evaluates the subject's exact situation and returns:
    (recommended_action_text, action_type, why_explanation)
    with natural, subject-tailored phrasing.
    """
    child_name = child_first_name or "your child"
    cat = get_subject_category(subject_name)

    # 1. Subject has a specific lowest-scored or priority chapter
    if lowest_chapter_name:
        action, action_type, why, _, _ = get_subject_pedagogical_guidance(
            subject_name=subject_name,
            chapter_name=lowest_chapter_name,
            child_name=child_name,
            mastery_score=mastery_score,
            status_level=status_level
        )
        return (action, action_type, why)

    # 2. General Subject-Level Guidance (when no single chapter stands out)
    score_int = int(round(mastery_score)) if mastery_score > 0 else 0

    if status_level == "high" or mastery_score >= 80.0:
        if cat == "math":
            action = f"{child_name} has strong mathematical mastery in {subject_name}! Encourage exploring challenging problem sets or puzzles."
            why = f"High quiz score ({score_int}%) shows accurate calculation and strong conceptual understanding."
        elif cat == "language":
            action = f"{child_name} has high command of {subject_name}! Encourage creative writing and reading advanced stories."
            why = f"High retention score ({score_int}%) reflects strong comprehension and rich vocabulary."
        elif cat == "science":
            action = f"{child_name} shows great scientific understanding in {subject_name}! Ask them to explain real-world applications."
            why = f"Scoring {score_int}% across science assessments demonstrates solid conceptual grasp."
        else:
            action = f"{child_name} has demonstrated strong mastery in {subject_name} ({score_int}%). Encourage maintaining regular revision."
            why = f"High average quiz score of {score_int}% reflects solid comprehension across lessons."
        return (action, "Continue", why)

    if status_level == "medium" or (50.0 <= mastery_score < 80.0):
        if cat == "math":
            action = f"Encourage {child_name} to do 10 minutes of step-by-step scratchpad calculations to build speed and accuracy."
            why = f"Current mastery is {score_int}%; steady practice turns developing skills into automatic reflexes."
        elif cat == "language":
            action = f"Encourage {child_name} to read {subject_name} passages aloud and practice writing short chapter summaries."
            why = f"Active reading aloud ({score_int}% current score) builds vocabulary retention and writing fluency."
        elif cat == "science":
            action = f"Ask {child_name} to explain key scientific diagrams and terms from recent {subject_name} lessons."
            why = f"Explaining scientific diagrams aloud ({score_int}% current score) is the best active recall method."
        else:
            action = f"Encourage {child_name} to maintain regular study blocks in {subject_name} to move it into the Mastered tier."
            why = f"Steady progress ({score_int}% current score) with good potential to cross into the top mastery tier."
        return (action, "Practice", why)

    if status_level == "low" or (0 < mastery_score < 50.0):
        if cat == "math":
            action = f"Work through 2–3 foundational math examples on paper with {child_name} to clear up confusing formula steps."
            why = f"Math retention is at {score_int}%; hands-on calculation on paper builds confidence without test pressure."
        elif cat == "language":
            action = f"Read through {subject_name} stories together with {child_name} to clarify new words and main story points."
            why = f"Language score is currently {score_int}%; casual reading together over tea rebuilds comprehension."
        elif cat == "science":
            action = f"Help {child_name} connect {subject_name} lessons to everyday household and nature examples to clear up difficult topics."
            why = f"Retention is at {score_int}%; real-world examples make abstract science intuitive."
        else:
            action = f"Sit with {child_name} for a friendly 10-minute check-in to review tricky concepts in {subject_name}."
            why = f"Score is currently {score_int}%; identifying confusing points early prevents backlogs."
        return (action, "Prioritize", why)

    # In Progress with chapters done but quiz pending
    if chapters_completed > 0:
        action = f"Encourage {child_name} to complete the diagnostic quiz for {subject_name} now that {chapters_completed} chapters are covered."
        why = f"{chapters_completed} of {total_chapters} chapters finished. Taking the quiz updates their adaptive study plan."
        return (action, "Assess", why)

    # Not Started Yet
    action = f"Encourage {child_name} to kick off their first chapter in {subject_name} during their dedicated study block."
    why = f"No study sessions logged for {subject_name} yet; starting early ensures balanced weekly coverage."
    return (action, "Practice", why)


def get_subject_category_and_tip(subject_name: str) -> Tuple[str, str]:
    """
    Returns canonical domain category code and default home tip without frontend UI specifics.
    Category codes: MATHEMATICS | NATURAL_SCIENCES | LANGUAGES | HUMANITIES | GENERAL
    """
    name = (subject_name or "").lower()
    if "math" in name or "गणित" in name:
        return (
            "MATHEMATICS",
            "Keep supporting uninterrupted study blocks and encourage step-by-step scratchpad work."
        )
    elif "hindi" in name or "हिंदी" in name or "मराठी" in name or "marathi" in name or "english" in name:
        return (
            "LANGUAGES",
            "Practice reading chapters together and discussing new word meanings."
        )
    elif "science" in name or "विज्ञान" in name or "physics" in name or "chemistry" in name or "biology" in name or "evs" in name:
        return (
            "NATURAL_SCIENCES",
            "Ask your child to demonstrate or describe real-world applications of scientific laws."
        )
    elif "geography" in name or "भूगोल" in name or "history" in name or "civics" in name or "social" in name or "इतिहास" in name:
        return (
            "HUMANITIES",
            "Explore maps and historical events together as storytelling narratives rather than isolated dates."
        )
    return (
        "GENERAL",
        "Celebrate small milestones and offer words of encouragement after study blocks."
    )


def get_subject_theme_and_icon(subject_name: str) -> Tuple[str, str, str]:
    """Deprecated legacy helper maintained for transition. Returns (icon_name, color_theme, default_home_tip)"""
    cat, tip = get_subject_category_and_tip(subject_name)
    # Temporary fallback mappings for reference FE prototype
    icon_map = {
        "MATHEMATICS": ("Calculator", "indigo"),
        "LANGUAGES": ("BookOpen", "blue"),
        "NATURAL_SCIENCES": ("FlaskConical", "emerald"),
        "HUMANITIES": ("Globe", "amber"),
        "GENERAL": ("GraduationCap", "purple"),
    }
    icon, color = icon_map.get(cat, ("GraduationCap", "purple"))
    return (icon, color, tip)


