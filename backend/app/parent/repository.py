"""
Repository for parent data access, isolated auth, and student telemetry aggregation.
Fully dynamic calculations tied to individual student progress.
"""

import uuid
import json
import hashlib
from typing import Optional, List, Dict, Any
from datetime import datetime, date, timedelta

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, desc, text as sa_text

from app.models.parent import Parent
from app.models.student_profile import StudentProfile
from app.models.standard import Standard
from app.models.subject import Subject
from app.models.chapter import Chapter
from app.models.chapter_assessment import ChapterAssessment
from app.models.daily_plan_task import DailyPlanTask, TaskStatusEnum
from app.models.chapter_mastery import ChapterMastery
from app.models.syllabus_progress import SyllabusProgress

from app.parent.models import (
    ParentDashboardResponse,
    ParentAuthResponse,
    ChildProfile,
    LivePresence,
    HealthOverview,
    HealthMetric,
    SubjectMasteryCard,
    DailyAgendaBlock,
    StudentCommitmentItem,
)
from app.parent.insights import generate_parent_insights, get_subject_theme_and_icon, get_subject_category_and_tip, generate_subject_home_tip


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    if plain_password == hashed_password:
        return True
    return hash_password(plain_password) == hashed_password


def format_24h_to_12h(time_str: str) -> str:
    """Helper to convert 24h HH:MM to 12h HH:MM AM/PM display string."""
    if not time_str:
        return ""
    try:
        parts = time_str.strip().split(":")
        if len(parts) >= 2:
            h = int(parts[0])
            m = int(parts[1])
            period = "PM" if h >= 12 else "AM"
            display_h = 12 if h % 12 == 0 else h % 12
            return f"{display_h:02d}:{m:02d} {period}"
    except Exception:
        pass
    return time_str


class ParentRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_parent_by_username(self, username: str) -> Optional[Parent]:
        query = select(Parent).where(Parent.username == username.strip())
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_parent_by_id(self, parent_id: str) -> Optional[Parent]:
        query = select(Parent).where(Parent.id == parent_id.strip())
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_student_by_username(self, student_username: str) -> Optional[StudentProfile]:
        if not student_username:
            return None
        query = select(StudentProfile).where(StudentProfile.username == student_username.strip())
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_student_by_id(self, student_id: int) -> Optional[StudentProfile]:
        query = select(StudentProfile).where(StudentProfile.student_id == student_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def create_parent(
        self,
        full_name: str,
        username: str,
        password: str,
        student_username: str,
    ) -> Parent:
        parent = Parent(
            id=str(uuid.uuid4()),
            username=username.strip(),
            password_hash=hash_password(password),
            full_name=full_name.strip(),
            student_username=student_username.strip(),
        )
        self.db.add(parent)
        await self.db.commit()
        await self.db.refresh(parent)
        return parent

    async def get_dashboard_data(self, parent: Parent) -> ParentDashboardResponse:
        # 1. Resolve student profile
        student = await self.get_student_by_username(parent.student_username)
        if not student:
            raise ValueError(f"Linked student '{parent.student_username}' not found.")

        # 2. Resolve standard details
        std_name = f"Standard {student.standard_id}"
        std_res = await self.db.execute(select(Standard).where(Standard.standard_id == student.standard_id))
        std_obj = std_res.scalar_one_or_none()
        if std_obj and hasattr(std_obj, 'standard_name'):
            std_name = std_obj.standard_name

        child_full_name = f"{student.first_name} {student.last_name}".strip()

        # --- Rolling 7-day window for all "this week" metrics ---
        now_dt = datetime.now()
        week_start = (now_dt - timedelta(days=7)).date()

        # 3. Dynamic Telemetry Aggregation for this specific student
        # A. Tasks — current week only for discipline & hours; all-time for last-activity lookup
        task_stmt_week = select(DailyPlanTask).where(
            and_(
                DailyPlanTask.student_id == student.student_id,
                DailyPlanTask.plan_date >= week_start
            )
        ).order_by(desc(DailyPlanTask.plan_date))
        task_res_week = await self.db.execute(task_stmt_week)
        week_tasks = task_res_week.scalars().all()

        # Separate PENDING/IN_PROGRESS from COMPLETED within this week
        week_completed_tasks = [
            t for t in week_tasks
            if str(t.status.value if hasattr(t.status, 'value') else t.status).upper() == 'COMPLETED'
        ]
        week_skipped_tasks = [
            t for t in week_tasks
            if str(t.status.value if hasattr(t.status, 'value') else t.status).upper() == 'SKIPPED'
        ]
        # Discipline denominator: scheduled tasks this week (exclude SKIPPED — student had legitimate absence)
        discipline_total = len(week_tasks) - len(week_skipped_tasks)
        completed_task_mins = sum(t.allocated_minutes for t in week_completed_tasks)

        # For last-activity display, also fetch most-recent completed task all-time
        latest_completed_stmt = select(DailyPlanTask).where(
            and_(
                DailyPlanTask.student_id == student.student_id,
                DailyPlanTask.status == TaskStatusEnum.COMPLETED
            )
        ).order_by(desc(DailyPlanTask.completed_at)).limit(1)
        latest_completed_res = await self.db.execute(latest_completed_stmt)
        latest_completed_task = latest_completed_res.scalar_one_or_none()

        # B. Query all ChapterMastery (for retention scoring; not scoped to a week by design —
        #    mastery is cumulative). For study-hours we count stages completed this week via
        #    mastery updated_at when available, otherwise fall back to all-time.
        mast_stmt = select(ChapterMastery).where(
            ChapterMastery.student_id == student.student_id
        )
        mast_res = await self.db.execute(mast_stmt)
        all_mastery_objs = mast_res.scalars().all()

        mastery_stages_completed_week = 0
        mastery_mins = 0
        for m in all_mastery_objs:
            stage_str = str(m.current_stage.value if hasattr(m.current_stage, 'value') else m.current_stage).upper()
            stg = (
                (1 if m.concept_completed else 0)
                + (1 if m.practice_completed else 0)
                + (1 if m.recall_completed else 0)
                + (1 if stage_str == 'COMPLETED' else 0)
            )
            # Count stages toward hours only if updated this week
            updated = getattr(m, 'updated_at', None) or getattr(m, 'last_reviewed_at', None)
            in_week = (
                isinstance(updated, (datetime, date))
                and (updated.date() if isinstance(updated, datetime) else updated) >= week_start
            )
            if in_week:
                mastery_stages_completed_week += stg
                mastery_mins += stg * 35  # ~35 mins per completed mastery stage

        # C. Query Completed Assessments — this week only for hours; all assessments for retention
        ass_stmt_week = select(ChapterAssessment).where(
            and_(
                ChapterAssessment.student_id == student.student_id,
                ChapterAssessment.status_str == 'COMPLETED',
                ChapterAssessment.completed_at >= now_dt - timedelta(days=7)
            )
        ).order_by(desc(ChapterAssessment.completed_at))
        ass_res_week = await self.db.execute(ass_stmt_week)
        assessments_week = ass_res_week.scalars().all()
        ass_mins = sum(max(15, (a.time_taken or 0) // 60) for a in assessments_week)

        # All-time assessments for retention average (up to 50 most recent)
        ass_stmt_all = select(ChapterAssessment).where(
            and_(
                ChapterAssessment.student_id == student.student_id,
                ChapterAssessment.status_str == 'COMPLETED'
            )
        ).order_by(desc(ChapterAssessment.completed_at)).limit(50)
        ass_res_all = await self.db.execute(ass_stmt_all)
        assessments_all = ass_res_all.scalars().all()

        # D. Query Dynamic Recall Completions — this week only for hours
        drc_stmt = sa_text(
            "SELECT completion_id, time_taken_seconds, completed_at "
            "FROM xxed_dynamic_recall_completions "
            "WHERE student_id = :sid AND completed_at >= :since"
        )
        try:
            drc_res = await self.db.execute(drc_stmt, {"sid": student.student_id, "since": now_dt - timedelta(days=7)})
            drc_rows = drc_res.fetchall()
            drc_mins = sum(max(10, (r[1] or 0) // 60) for r in drc_rows)
            drc_count = len(drc_rows)
        except Exception:
            drc_rows = []
            drc_mins = 0
            drc_count = 0

        # Dynamic Weekly Hours Target
        daily_target = float(student.daily_study_hours or 2.0)
        weekly_target = round(daily_target * 7, 1)

        # Weekly completed hours — all four sources scoped to this week
        total_activity_count = len(week_completed_tasks) + mastery_stages_completed_week + len(assessments_week) + drc_count
        total_completed_mins = completed_task_mins + mastery_mins + ass_mins + drc_mins
        completed_hours = round(total_completed_mins / 60.0, 1)

        pct_hours_reached = round((completed_hours / max(0.1, weekly_target)) * 100.0)
        # Cap display at 100% — exceeding target is good but shouldn't show > 100%
        pct_hours_display = min(100, pct_hours_reached)
        hours_status = "high" if pct_hours_reached >= 80 else ("medium" if pct_hours_reached >= 40 else "low")
        remaining_hours = max(0.0, round(weekly_target - completed_hours, 1))

        # Study Discipline % — based on this week's tasks only
        if discipline_total > 0:
            discipline_pct = round((len(week_completed_tasks) / discipline_total) * 100.0, 1)
            disc_explanation = f"Completed {len(week_completed_tasks)} of {discipline_total} sessions this week"
        elif total_activity_count > 0:
            # No scheduled tasks yet but student is active — derive from hours progress
            discipline_pct = min(100.0, round((completed_hours / max(0.1, weekly_target)) * 100.0, 1))
            disc_explanation = f"{total_activity_count} learning activities recorded this week"
        else:
            discipline_pct = 0.0
            disc_explanation = "No study sessions recorded yet this week"

        if discipline_pct >= 80:
            disc_status = "high"
            disc_badge = "On Schedule"
        elif discipline_pct >= 50:
            disc_status = "medium"
            disc_badge = "In Progress"
        elif discipline_pct > 0:
            disc_status = "low"
            disc_badge = "Needs Catch-Up"
        else:
            disc_status = "medium"
            disc_badge = "Getting Started"

        # 4. Average Retention — assessment scores only (not mastery scores, which are a
        #    different scale). Uses all-time completed assessments for a stable average.
        #    Mastery scores are surfaced separately in Subject Mastery cards.
        collected_scores = []
        for a in assessments_all:
            val = float(a.percentage if a.percentage is not None else (a.accuracy or 0))
            if val > 0:
                collected_scores.append(val)

        # Supplement with mastery scores only when no quiz scores exist at all
        if not collected_scores:
            for m in all_mastery_objs:
                val = float(m.mastery_score)
                if val >= 10:  # only include meaningful mastery scores, not near-zero initialisation values
                    collected_scores.append(val)

        if collected_scores:
            retention_pct = round(sum(collected_scores) / len(collected_scores), 1)
            quiz_count = sum(1 for a in assessments_all if float(a.percentage if a.percentage is not None else (a.accuracy or 0)) > 0)
            source_label = (
                f"{quiz_count} quiz assessment{'s' if quiz_count != 1 else ''}"
                if quiz_count > 0
                else f"{len(collected_scores)} mastery score{'s' if len(collected_scores) != 1 else ''}"
            )
            if retention_pct >= 80:
                ret_status = "high"
                ret_badge = "Strong"
            elif retention_pct >= 60:
                ret_status = "medium"
                ret_badge = "Moderate"
            else:
                ret_status = "low"
                ret_badge = "Focus Needed"
            ret_explanation = f"Average across {source_label}"
        else:
            retention_pct = 0.0
            ret_status = "medium"
            ret_badge = "Pending Tests"
            ret_explanation = "Awaiting first chapter quiz to record retention score"

        # 5. Live Presence & Recent Activity
        last_activity_title = "Study plan active"
        last_active_text = "Recently active"

        if latest_completed_task and latest_completed_task.chapter_id:
            chap_res = await self.db.execute(select(Chapter).where(Chapter.chapter_id == latest_completed_task.chapter_id))
            chap_obj = chap_res.scalar_one_or_none()
            if chap_obj:
                last_activity_title = f'Finished "{chap_obj.chapter_name}"'
            if latest_completed_task.completed_at:
                diff = datetime.now() - latest_completed_task.completed_at
                mins = max(1, int(diff.total_seconds() / 60))
                if mins < 60:
                    last_active_text = f"Active {mins}m ago"
                elif mins < 1440:
                    last_active_text = f"Active {mins // 60}h ago"
                else:
                    last_active_text = f"Active {mins // 1440}d ago"
        elif assessments_all:
            latest_ass = assessments_all[0]
            last_activity_title = "Completed chapter assessment"
            if latest_ass.completed_at:
                diff = datetime.now() - latest_ass.completed_at
                mins = max(1, int(diff.total_seconds() / 60))
                last_active_text = f"Active {mins}m ago" if mins < 60 else f"Active {mins // 60}h ago"

        # 6. Subject-Wise Progress & Mastery (Computed dynamically per student)
        subj_stmt = select(Subject).where(Subject.standard_id == student.standard_id)
        subj_res = await self.db.execute(subj_stmt)
        subjects = subj_res.scalars().all()

        subject_cards: List[SubjectMasteryCard] = []
        lowest_scored_chapter = None
        min_chap_score = 100.0

        for subj in subjects:
            chap_stmt = select(Chapter).where(Chapter.subject_id == subj.subject_id)
            chap_res = await self.db.execute(chap_stmt)
            chap_list = chap_res.scalars().all()
            total_chaps = len(chap_list) or int(subj.total_chapters or 1)
            chap_ids = [c.chapter_id for c in chap_list]

            # 1. Fetch student's ChapterMastery records for this subject
            mast_objs = []
            if chap_ids:
                mast_subset_stmt = select(ChapterMastery).where(
                    and_(
                        ChapterMastery.student_id == student.student_id,
                        ChapterMastery.chapter_id.in_(chap_ids)
                    )
                )
                mast_subset_res = await self.db.execute(mast_subset_stmt)
                mast_objs = mast_subset_res.scalars().all()

            mast_map = {m.chapter_id: m for m in mast_objs}

            # 2. Fetch student's completed tasks for these chapters
            completed_task_cids = set()
            if chap_ids:
                task_stmt = select(DailyPlanTask.chapter_id).where(
                    and_(
                        DailyPlanTask.student_id == student.student_id,
                        DailyPlanTask.chapter_id.in_(chap_ids),
                        DailyPlanTask.status == TaskStatusEnum.COMPLETED
                    )
                ).distinct()
                task_res = await self.db.execute(task_stmt)
                completed_task_cids = set(task_res.scalars().all())

            # 3. Calculate student's dynamic completed chapters count
            # A chapter is completed by this student if marked completed in ChapterMastery,
            # has concept/recall finished, has passing mastery score, or has completed study task.
            done_chaps = 0
            subj_scores = []
            lowest_subj_chap_name = None
            min_subj_score = 101.0

            for c in chap_list:
                cid = c.chapter_id
                m = mast_map.get(cid)
                sc = float(m.mastery_score) if m and m.mastery_score is not None else 0.0

                is_completed = False
                if cid in completed_task_cids:
                    is_completed = True
                elif m:
                    stage_val = m.current_stage.value if hasattr(m.current_stage, 'value') else str(m.current_stage)
                    if (
                        stage_val == "COMPLETED"
                        or getattr(m, "concept_completed", 0) == 1
                        or getattr(m, "recall_completed", 0) == 1
                        or sc >= 50.0
                    ):
                        is_completed = True

                if is_completed:
                    done_chaps += 1

                if sc > 0:
                    subj_scores.append(sc)
                    if sc < min_subj_score:
                        min_subj_score = sc
                        lowest_subj_chap_name = c.chapter_name
                    if sc < min_chap_score:
                        min_chap_score = sc
                        matched_chap = c
                        lowest_scored_chapter = {
                            "chapter_name": matched_chap.chapter_name,
                            "subject_name": subj.subject_name,
                            "score": sc
                        }

            done_chaps = min(total_chaps, max(0, done_chaps))
            prog_pct = round((done_chaps / max(1, total_chaps)) * 100.0, 1)

            # 4. Subject mastery / Quiz average calculation
            category_code, _ = get_subject_category_and_tip(subj.subject_name)
            icon_name, color_theme, _ = get_subject_theme_and_icon(subj.subject_name)

            if subj_scores:
                quiz_avg = round(sum(subj_scores) / len(subj_scores), 1)
                if quiz_avg >= 80:
                    lvl = "high"
                    badge = f"{quiz_avg:.0f}% (Strong)"
                elif quiz_avg >= 50:
                    lvl = "medium"
                    badge = f"{quiz_avg:.0f}% (Moderate)"
                else:
                    lvl = "low"
                    badge = f"{quiz_avg:.0f}% (Needs Focus)"
            else:
                quiz_avg = 0.0
                if done_chaps > 0:
                    lvl = "in_progress"
                    badge = "In Progress"
                else:
                    lvl = "in_progress"
                    badge = "Not Started"

            # 5. Tailored dynamic coaching tip per student using 25 situation templates
            action_text, action_type, why_reason = generate_subject_home_tip(
                subject_name=subj.subject_name,
                mastery_score=quiz_avg,
                status_level=lvl,
                chapters_completed=done_chaps,
                total_chapters=total_chaps,
                lowest_chapter_name=lowest_subj_chap_name,
                child_first_name=student.first_name
            )

            subject_cards.append(
                SubjectMasteryCard(
                    subject_id=subj.subject_id,
                    subject_name=subj.subject_name,
                    subject_category=category_code,
                    chapters_completed=done_chaps,
                    total_chapters=total_chaps,
                    progress_percentage=prog_pct,
                    quiz_average_percentage=quiz_avg,
                    status_level=lvl,
                    status_badge=badge,
                    home_support_suggestion=action_text,
                    action_type=action_type,
                    action_reason=why_reason,
                    icon_name=icon_name,
                    color_theme=color_theme
                )
            )

        # 7. Actionable Guidance Generation
        guidance = generate_parent_insights(
            child_first_name=student.first_name,
            discipline_pct=discipline_pct,
            retention_pct=retention_pct,
            subject_cards=subject_cards,
            lowest_scored_chapter=lowest_scored_chapter,
            preferred_study_time=student.preferred_study_time.value if hasattr(student.preferred_study_time, 'value') else str(student.preferred_study_time)
        )

        # 8. All Student Commitments & Today's Read-Only Journey
        # SOLE HARD-CODED COMMITMENT IS SLEEP: 10:00 PM – 06:00 AM
        # All other commitments come exclusively from student.commitments_schedule!
        all_commitments: List[StudentCommitmentItem] = []
        today_journey: List[DailyAgendaBlock] = []

        # Parse user's real commitments from commitments_schedule
        raw_commitments = student.commitments_schedule
        parsed_commitments: List[Dict[str, Any]] = []
        if raw_commitments:
            if isinstance(raw_commitments, str):
                try:
                    parsed_commitments = json.loads(raw_commitments)
                except Exception:
                    parsed_commitments = []
            elif isinstance(raw_commitments, list):
                parsed_commitments = raw_commitments

        # Today's day code for filtering today's journey
        day_codes = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
        today_code = day_codes[now_dt.weekday()]
        today_iso = now_dt.strftime("%Y-%m-%d")

        # Process each commitment from student's schedule
        for idx, comm in enumerate(parsed_commitments):
            start_t = comm.get("startTime") or comm.get("start_time") or ""
            end_t = comm.get("endTime") or comm.get("end_time") or ""
            label = comm.get("label") or "Personal Commitment"
            rec_type = comm.get("recurrenceType") or comm.get("recurrence_type") or "WEEKLY_RECURRING"
            days = comm.get("daysOfWeek") or comm.get("days_of_week") or []
            spec_date = comm.get("specificDate") or comm.get("specific_date")
            color = comm.get("color")

            if start_t and end_t:
                time_display = f"{format_24h_to_12h(start_t)} – {format_24h_to_12h(end_t)}"

                # Determine human-friendly recurrence display
                if rec_type == "SPECIFIC_DATE":
                    rec_display = f"Specific Date: {spec_date or 'Custom Date'}"
                else:
                    if not days or set(days) == {'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'}:
                        rec_display = "Daily (All Days)"
                    elif set(days) == {'MON', 'TUE', 'WED', 'THU', 'FRI'}:
                        rec_display = "Weekdays (Mon–Fri)"
                    elif set(days) == {'SAT', 'SUN'}:
                        rec_display = "Weekends (Sat–Sun)"
                    else:
                        rec_display = ", ".join(days)

                # Determine commitment type
                lbl_lower = label.lower()
                if "tuition" in lbl_lower or "coaching" in lbl_lower or "class" in lbl_lower:
                    comm_type = "Tuition"
                elif "college" in lbl_lower or "school" in lbl_lower:
                    comm_type = "College"
                elif any(k in lbl_lower for k in ["sport", "football", "cricket", "gym", "swim", "activity", "dance"]):
                    comm_type = "Sports/Activity"
                elif "travel" in lbl_lower or "bus" in lbl_lower or "commute" in lbl_lower:
                    comm_type = "Travel"
                else:
                    comm_type = comm.get("commitmentType") or comm.get("commitment_type") or "Other"

                all_commitments.append(
                    StudentCommitmentItem(
                        id=f"comm-{comm.get('id', idx)}",
                        label=label,
                        commitment_type=comm_type,
                        time_range=time_display,
                        start_time=start_t,
                        end_time=end_t,
                        recurrence_type=rec_type,
                        recurrence_display=rec_display,
                        days_of_week=days,
                        specific_date=spec_date,
                        is_locked=True,
                        badge_label="Protected Commitment",
                        color=color
                    )
                )

                # Check if this commitment applies today for today's journey
                applies_today = False
                if rec_type == "SPECIFIC_DATE" and spec_date == today_iso:
                    applies_today = True
                elif rec_type == "WEEKLY_RECURRING":
                    if not days or today_code in [d.upper() for d in days]:
                        applies_today = True

                if applies_today:
                    today_journey.append(
                        DailyAgendaBlock(
                            id=f"comm-block-{comm.get('id', idx)}",
                            title=label,
                            time_range=time_display,
                            block_type="school",
                            is_locked=True,
                            status_badge="Protected Commitment",
                            details="Student-configured personal commitment or unavailable slot."
                        )
                    )

        # Planned Home Study Focus block from student profile for today's journey
        start_study = format_24h_to_12h(student.preferred_study_start_time or "18:00")
        end_study = format_24h_to_12h(student.preferred_study_end_time or "20:00")
        pref_slot_name = student.preferred_study_time.value if hasattr(student.preferred_study_time, 'value') else str(student.preferred_study_time)

        today_journey.append(
            DailyAgendaBlock(
                id="block-study-slot",
                title=f"AuraStudy Study Focus ({pref_slot_name})",
                time_range=f"{start_study} – {end_study}",
                block_type="study",
                is_locked=False,
                status_badge="Active Study Slot",
                details=f"{daily_target} hrs planned for adaptive chapter learning, active recall, and micro-drills."
            )
        )

        # 9. Health Overview Metrics
        health_overview = HealthOverview(
            study_discipline=HealthMetric(
                metric_key="discipline",
                title="Study Discipline",
                value=discipline_pct,
                formatted=f"{discipline_pct:.0f}%",
                status_level=disc_status,
                badge_label=disc_badge,
                subtext="Consistent study adherence",
                explanation=disc_explanation
            ),
            average_retention=HealthMetric(
                metric_key="retention",
                title="Average Retention",
                value=retention_pct,
                formatted=f"{retention_pct:.0f}%",
                status_level=ret_status,
                badge_label=ret_badge,
                subtext="Score across assessments",
                explanation=ret_explanation
            ),
            weekly_study_hours=HealthMetric(
                metric_key="weekly_hours",
                title="Weekly Study Hours",
                value=completed_hours,
                formatted=f"{completed_hours} hrs / {weekly_target} hrs",
                status_level=hours_status,
                badge_label=f"{pct_hours_display}% of Target",
                subtext="Dedicated home focus time",
                explanation=f"{completed_hours} hrs completed • {remaining_hours} hrs remaining this week"
            ),
            weekly_target_hours=weekly_target,
            completed_study_hours=completed_hours
        )

        return ParentDashboardResponse(
            parent_info=ParentAuthResponse(
                parent_id=parent.id,
                username=parent.username,
                full_name=parent.full_name,
                student_username=parent.student_username,
                student_id=student.student_id,
                student_name=child_full_name
            ),
            child_profile=ChildProfile(
                student_id=student.student_id,
                first_name=student.first_name,
                last_name=student.last_name,
                full_name=child_full_name,
                username=student.username,
                standard_name=std_name,
                school_name=student.school_name,
                medium=student.medium.value if hasattr(student.medium, 'value') else str(student.medium),
                study_goal=student.study_goal.value if hasattr(student.study_goal, 'value') else str(student.study_goal),
                daily_study_hours=daily_target,
                streak_days=5
            ),
            live_presence=LivePresence(
                is_online=True,
                last_active_text=last_active_text,
                last_activity_title=last_activity_title,
                status_label="Active"
            ),
            health_overview=health_overview,
            actionable_guidance=guidance,
            subject_mastery=subject_cards,
            today_journey=today_journey,
            all_commitments=all_commitments
        )
