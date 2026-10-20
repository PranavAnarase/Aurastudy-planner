from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Personalized Study Planner API",
    description="Adaptive daily and weekly academic study scheduler prototype."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount AuraStudy Version 1 Central Router (/api/v1/aurastudy)
from app.api_v1 import aurastudy_v1_router
app.include_router(aurastudy_v1_router)

# Mount direct routers for backward compatibility with root routes (/planner, /onboarding, etc.)
from app.planner.router import router as planner_router
from app.onboarding.router import router as onboarding_router
from app.diagnostic.router import router as diagnostic_router
from app.progress.router import router as progress_router
from app.parent.router import router as parent_router
from app.assessment.router import router as assessment_router

app.include_router(planner_router)
app.include_router(onboarding_router)
app.include_router(diagnostic_router)
app.include_router(progress_router)
app.include_router(parent_router)
app.include_router(assessment_router)


@app.on_event("startup")
async def startup_db_migration():
    from app.db_check import run_db_check
    await run_db_check()
    from app.database import engine
    from sqlalchemy import text
    try:
        async with engine.begin() as conn:
            # Check if connected to new xxed_ database
            res_new = await conn.execute(text("SHOW TABLES LIKE 'xxed_user_profile_tab'"))
            if res_new.fetchone():
                import logging
                logger = logging.getLogger(__name__)
                logger.info("Connected to new xxed_ database. Verifying AUTO_INCREMENT on operational tables...")
                
                auto_inc_targets = [
                    ("xxed_user_assessment_data", "user_ass_id"),
                    ("xxed_user_answer_data", "user_answer_id"),
                    ("xxed_chapter_mastery_tab", "chapter_mastery_id"),
                    ("xxed_daily_plan_tasks_tab", "task_id"),
                    ("xxed_syllabus_progress_tab", "progress_id"),
                    ("xxed_assessments_tab", "assessment_id"),
                ]
                
                for tbl, col in auto_inc_targets:
                    try:
                        tbl_exists = await conn.execute(text(f"SHOW TABLES LIKE '{tbl}'"))
                        if not tbl_exists.fetchone():
                            continue
                        col_info = await conn.execute(text(f"""
                            SELECT COLUMN_TYPE, EXTRA FROM information_schema.COLUMNS 
                            WHERE TABLE_SCHEMA = DATABASE() 
                              AND TABLE_NAME = '{tbl}' 
                              AND COLUMN_NAME = '{col}'
                        """))
                        row = col_info.fetchone()
                        if row:
                            col_type, extra = row[0], (row[1] or "").lower()
                            if "auto_increment" not in extra:
                                logger.info(f"Applying AUTO_INCREMENT to {tbl}.{col} (type: {col_type})...")
                                await conn.execute(text("SET FOREIGN_KEY_CHECKS = 0;"))
                                await conn.execute(text(f"ALTER TABLE `{tbl}` MODIFY COLUMN `{col}` {col_type} NOT NULL AUTO_INCREMENT;"))
                                await conn.execute(text("SET FOREIGN_KEY_CHECKS = 1;"))
                                logger.info(f"Successfully enabled AUTO_INCREMENT on {tbl}.{col}")
                    except Exception as ex:
                        logger.error(f"Error checking/applying AUTO_INCREMENT on {tbl}.{col}: {ex}")
                        try:
                            await conn.execute(text("SET FOREIGN_KEY_CHECKS = 1;"))
                        except Exception:
                            pass

                # Ensure nullable columns that may lack DEFAULT values have one,
                # or ADD them if they don't exist at all.
                nullable_default_targets = [
                    ("xxed_user_assessment_data", "percentage",    "DECIMAL(5,2)",  "0.00"),
                    ("xxed_user_assessment_data", "accuracy",      "DECIMAL(5,2)",  "0.00"),
                    ("xxed_user_assessment_data", "obtained_marks","DECIMAL(8,2)",  "0.00"),
                    ("xxed_user_assessment_data", "total_marks",   "DECIMAL(8,2)",  "0.00"),
                ]
                for tbl, col, col_type, default_val in nullable_default_targets:
                    try:
                        tbl_exists_r = await conn.execute(text(f"SHOW TABLES LIKE '{tbl}'"))
                        if not tbl_exists_r.fetchone():
                            continue
                        col_info = await conn.execute(text(f"""
                            SELECT COLUMN_DEFAULT FROM information_schema.COLUMNS
                            WHERE TABLE_SCHEMA = DATABASE()
                              AND TABLE_NAME = '{tbl}'
                              AND COLUMN_NAME = '{col}'
                        """))
                        row = col_info.fetchone()
                        if row is None:
                            # Column doesn't exist — add it
                            await conn.execute(text(
                                f"ALTER TABLE `{tbl}` ADD COLUMN `{col}` {col_type} NULL DEFAULT {default_val};"
                            ))
                            logger.info(f"Added missing column {tbl}.{col} ({col_type} DEFAULT {default_val})")
                        elif row[0] is None:
                            # Column exists but has no DEFAULT — add one
                            await conn.execute(text(
                                f"ALTER TABLE `{tbl}` MODIFY COLUMN `{col}` {col_type} NULL DEFAULT {default_val};"
                            ))
                            logger.info(f"Set DEFAULT {default_val} on {tbl}.{col}")
                    except Exception as ex:
                        logger.warning(f"Could not ensure default on {tbl}.{col}: {ex}")
                
                try:
                    logger.info("Backfilling NULL values in xxed_user_assessment_data...")
                    await conn.execute(text("""
                        UPDATE xxed_user_assessment_data uad
                        LEFT JOIN (
                            SELECT 
                                user_ass_id,
                                COUNT(*) as total_q,
                                SUM(CASE WHEN user_answer IS NOT NULL AND user_answer != '' THEN 1 ELSE 0 END) as att_q,
                                SUM(CASE WHEN user_answer IS NULL OR user_answer = '' THEN 1 ELSE 0 END) as unatt_q,
                                SUM(CASE WHEN obtained_marks > 0 THEN 1 ELSE 0 END) as corr_cnt,
                                SUM(CASE WHEN (user_answer IS NOT NULL AND user_answer != '') AND (obtained_marks IS NULL OR obtained_marks = 0) THEN 1 ELSE 0 END) as incorr_cnt,
                                COALESCE(SUM(time_taken), 0) as tot_time,
                                COALESCE(SUM(obtained_marks), 0) as tot_obt
                            FROM xxed_user_answer_data
                            GROUP BY user_ass_id
                        ) ans ON uad.user_ass_id = ans.user_ass_id
                        SET 
                            uad.total_question = COALESCE(uad.total_question, ans.total_q, 10),
                            uad.attempted_question = COALESCE(uad.attempted_question, ans.att_q, 0),
                            uad.un_attempted_question = COALESCE(uad.un_attempted_question, ans.unatt_q, COALESCE(uad.total_question, 10) - COALESCE(uad.attempted_question, ans.att_q, 0)),
                            uad.correct_count = COALESCE(uad.correct_count, ans.corr_cnt, 0),
                            uad.incorrect_count = COALESCE(uad.incorrect_count, ans.incorr_cnt, 0),
                            uad.time_taken = COALESCE(uad.time_taken, ans.tot_time, 0),
                            uad.percentage = COALESCE(uad.percentage, uad.accuracy, 0.0),
                            uad.accuracy = COALESCE(uad.accuracy, uad.percentage, 0.0),
                            uad.obtained_marks = COALESCE(uad.obtained_marks, ans.tot_obt, 0.0),
                            uad.total_marks = COALESCE(uad.total_marks, ans.total_q, 10.0),
                            uad.result_status = COALESCE(uad.result_status, 'IN_PROGRESS')
                        WHERE uad.attempted_question IS NULL 
                           OR uad.un_attempted_question IS NULL 
                           OR uad.correct_count IS NULL 
                           OR uad.incorrect_count IS NULL 
                           OR uad.time_taken IS NULL 
                           OR uad.percentage IS NULL
                           OR uad.total_question IS NULL;
                    """))
                    logger.info("Successfully backfilled NULL telemetry columns in xxed_user_assessment_data.")
                except Exception as ex_bf:
                    logger.warning(f"Notice on telemetry backfill: {ex_bf}")

                # Ensure dynamic recall completions table exists
                try:
                    await conn.execute(text("""
                        CREATE TABLE IF NOT EXISTS xxed_dynamic_recall_completions (
                            completion_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                            student_id BIGINT UNSIGNED NOT NULL,
                            slot_id VARCHAR(100) NOT NULL,
                            completed_date DATE NOT NULL,
                            activity_type VARCHAR(50) NULL,
                            accuracy DECIMAL(5,2) NULL DEFAULT 0.00,
                            obtained_marks DECIMAL(5,2) NULL DEFAULT 0.00,
                            total_marks DECIMAL(5,2) NULL DEFAULT 0.00,
                            time_taken_seconds INT NULL DEFAULT 0,
                            completed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            UNIQUE KEY uq_student_slot_date (student_id, slot_id, completed_date),
                            INDEX idx_drc_student_date (student_id, completed_date)
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
                    """))
                    logger.info("Verified xxed_dynamic_recall_completions table.")
                except Exception as ex_drc:
                    logger.warning(f"Notice on xxed_dynamic_recall_completions creation: {ex_drc}")

                # Ensure isolated xxed_parents_tab exists
                try:
                    await conn.execute(text("""
                        CREATE TABLE IF NOT EXISTS xxed_parents_tab (
                            id VARCHAR(36) NOT NULL PRIMARY KEY,
                            username VARCHAR(50) NOT NULL UNIQUE,
                            password_hash VARCHAR(255) NOT NULL,
                            full_name VARCHAR(100) NOT NULL,
                            student_username VARCHAR(100) NOT NULL,
                            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            INDEX idx_parents_student_username (student_username)
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
                    """))
                    logger.info("Verified xxed_parents_tab table.")
                except Exception as ex_p:
                    logger.warning(f"Notice on xxed_parents_tab creation: {ex_p}")

                return

            # Check if columns exist using SHOW COLUMNS
            res = await conn.execute(text("SHOW COLUMNS FROM student_profiles LIKE 'username'"))
            row = res.fetchone()
            if not row:
                # Add columns username and password
                await conn.execute(text("ALTER TABLE student_profiles ADD COLUMN username VARCHAR(100) UNIQUE NULL"))
                await conn.execute(text("ALTER TABLE student_profiles ADD COLUMN password VARCHAR(255) NULL"))

            # Check for preferred_study_start_time and preferred_study_end_time
            res_time = await conn.execute(text("SHOW COLUMNS FROM student_profiles LIKE 'preferred_study_start_time'"))
            row_time = res_time.fetchone()
            if not row_time:
                await conn.execute(text("ALTER TABLE student_profiles ADD COLUMN preferred_study_start_time VARCHAR(5) NULL"))
                await conn.execute(text("ALTER TABLE student_profiles ADD COLUMN preferred_study_end_time VARCHAR(5) NULL"))

            # Check and add selected_academic_sections column to diagnostic_sessions
            res_sec = await conn.execute(text("SHOW COLUMNS FROM diagnostic_sessions LIKE 'selected_academic_sections'"))
            row_sec = res_sec.fetchone()
            if not row_sec:
                await conn.execute(text("ALTER TABLE diagnostic_sessions ADD COLUMN selected_academic_sections JSON NULL"))

            # Backfill existing completed sessions
            res_null = await conn.execute(text("""
                SELECT session_id, student_id FROM diagnostic_sessions 
                WHERE selected_academic_sections IS NULL AND status = 'COMPLETED'
            """))
            null_sessions = res_null.fetchall()
            for row_s in null_sessions:
                sid, stud_id = row_s.session_id, row_s.student_id
                if stud_id == 4:
                    # Parth Devker override - only Mathematics is attempted
                    selected_secs = ["Mathematics"]
                else:
                    # Query subjects that have answers
                    res_sub = await conn.execute(text("""
                        SELECT DISTINCT sub.subject_name
                        FROM diagnostic_responses dr
                        JOIN academic_questions aq ON dr.question_id = aq.question_id
                        JOIN chapters c ON aq.chapter_id = c.chapter_id
                        JOIN subjects sub ON c.subject_id = sub.subject_id
                        WHERE dr.session_id = :sid AND dr.question_source = 'ACADEMIC' AND dr.selected_option IS NOT NULL
                    """), {"sid": sid})
                    sub_names = [r[0] for r in res_sub.fetchall()]
                    
                    CHECKLIST_MAP = {
                        "Mathematics": "Mathematics",
                        "General Science": "Science",
                        "Environmental Studies Part 1": "Science",
                        "English": "English",
                        "History & Civics": "History and Civics",
                        "Environmental Studies Part 2": "History and Civics",
                        "Geography": "Geography",
                        "Hindi": "Hindi",
                        "Marathi": "Marathi"
                    }
                    selected_secs = sorted(list(set(CHECKLIST_MAP[name] for name in sub_names if name in CHECKLIST_MAP)))
                    
                    if not selected_secs:
                        # Fallback: check all assigned questions
                        res_assigned = await conn.execute(text("""
                            SELECT DISTINCT sub.subject_name
                            FROM diagnostic_questions dq
                            JOIN academic_questions aq ON dq.question_id = aq.question_id
                            JOIN chapters c ON aq.chapter_id = c.chapter_id
                            JOIN subjects sub ON c.subject_id = sub.subject_id
                            WHERE dq.session_id = :sid AND dq.question_source = 'ACADEMIC'
                        """), {"sid": sid})
                        assigned_names = [r[0] for r in res_assigned.fetchall()]
                        selected_secs = sorted(list(set(CHECKLIST_MAP[name] for name in assigned_names if name in CHECKLIST_MAP)))

                    if not selected_secs:
                        selected_secs = ["Mathematics", "Science", "English", "History and Civics", "Geography", "Hindi", "Marathi"]

                import json
                await conn.execute(text("""
                    UPDATE diagnostic_sessions
                    SET selected_academic_sections = :secs
                    WHERE session_id = :sid
                """), {"secs": json.dumps(selected_secs), "sid": sid})

            # Ensure chapter_assessments tables exist and have assessment_id column
            try:
                res_ca = await conn.execute(text("SHOW COLUMNS FROM chapter_assessments LIKE 'assessment_id'"))
                if not res_ca.fetchone():
                    # Table exists with legacy schema, drop and recreate
                    await conn.execute(text("DROP TABLE IF EXISTS chapter_assessment_responses"))
                    await conn.execute(text("DROP TABLE IF EXISTS chapter_assessment_items"))
                    await conn.execute(text("DROP TABLE IF EXISTS chapter_assessments"))
            except Exception:
                pass

            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS chapter_assessments (
                    assessment_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    student_id BIGINT UNSIGNED NOT NULL,
                    chapter_id BIGINT UNSIGNED NOT NULL,
                    attempt_number INT NOT NULL DEFAULT 1,
                    total_questions INT NOT NULL,
                    obtained_marks DECIMAL(5,2) NULL,
                    total_marks DECIMAL(5,2) NULL,
                    accuracy DECIMAL(5,2) NULL,
                    assessment_type ENUM('CHAPTER_TEST', 'SPACED_REVIEW') NOT NULL DEFAULT 'CHAPTER_TEST',
                    status ENUM('IN_PROGRESS', 'COMPLETED', 'ABANDONED') NOT NULL DEFAULT 'IN_PROGRESS',
                    started_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                    completed_at TIMESTAMP NULL,
                    INDEX idx_ca_student (student_id),
                    INDEX idx_ca_chapter (chapter_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            """))

            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS chapter_assessment_items (
                    item_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    assessment_id BIGINT UNSIGNED NOT NULL,
                    question_id BIGINT UNSIGNED NOT NULL,
                    question_order INT NOT NULL,
                    INDEX idx_cai_assessment (assessment_id),
                    INDEX idx_cai_question (question_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            """))

            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS chapter_assessment_responses (
                    response_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    assessment_id BIGINT UNSIGNED NOT NULL,
                    question_id BIGINT UNSIGNED NOT NULL,
                    selected_option VARCHAR(1) NULL,
                    is_correct TINYINT(1) NULL,
                    time_taken_seconds INT NULL DEFAULT 0,
                    attempt_status ENUM('ANSWERED', 'SKIPPED', 'TIMED_OUT') NOT NULL DEFAULT 'ANSWERED',
                    INDEX idx_car_assessment (assessment_id),
                    INDEX idx_car_question (question_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            """))

            # Check and add stage pipeline columns to chapter_mastery
            try:
                res_stage = await conn.execute(text("SHOW COLUMNS FROM chapter_mastery LIKE 'current_stage'"))
                if not res_stage.fetchone():
                    await conn.execute(text("""
                        ALTER TABLE `chapter_mastery`
                        ADD COLUMN `current_stage` ENUM('CONCEPT_STUDY', 'PRACTICE_DRILL', 'ACTIVE_RECALL', 'READY_FOR_ASSESSMENT', 'COMPLETED') NOT NULL DEFAULT 'CONCEPT_STUDY' AFTER `confidence`,
                        ADD COLUMN `concept_completed` TINYINT(1) NOT NULL DEFAULT 0 AFTER `current_stage`,
                        ADD COLUMN `practice_completed` TINYINT(1) NOT NULL DEFAULT 0 AFTER `concept_completed`,
                        ADD COLUMN `recall_completed` TINYINT(1) NOT NULL DEFAULT 0 AFTER `practice_completed`,
                        ADD COLUMN `assessment_unlocked` TINYINT(1) NOT NULL DEFAULT 0 AFTER `recall_completed`
                    """))
            except Exception as e_cm:
                import logging
                logging.getLogger(__name__).warning(f"chapter_mastery migration notice: {e_cm}")

            # Check and add ai_overall_summary to chapter_assessments
            try:
                res_ai_ca = await conn.execute(text("SHOW COLUMNS FROM chapter_assessments LIKE 'ai_overall_summary'"))
                if not res_ai_ca.fetchone():
                    await conn.execute(text("""
                        ALTER TABLE `chapter_assessments`
                        ADD COLUMN `ai_overall_summary` TEXT DEFAULT NULL AFTER `accuracy`
                    """))
            except Exception as e_ai_ca:
                import logging
                logging.getLogger(__name__).warning(f"chapter_assessments AI migration notice: {e_ai_ca}")

            # Check and add ai diagnostic columns to chapter_assessment_responses
            try:
                res_ai_car = await conn.execute(text("SHOW COLUMNS FROM chapter_assessment_responses LIKE 'ai_concept_gap'"))
                if not res_ai_car.fetchone():
                    await conn.execute(text("""
                        ALTER TABLE `chapter_assessment_responses`
                        ADD COLUMN `ai_concept_gap` VARCHAR(255) DEFAULT NULL AFTER `attempt_status`,
                        ADD COLUMN `ai_misconception_feedback` TEXT DEFAULT NULL AFTER `ai_concept_gap`,
                        ADD COLUMN `ai_memory_tip` VARCHAR(255) DEFAULT NULL AFTER `ai_misconception_feedback`
                    """))
            except Exception as e_ai_car:
                import logging
                logging.getLogger(__name__).warning(f"chapter_assessment_responses AI migration notice: {e_ai_car}")

            # Ensure parents table exists
            try:
                await conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS parents (
                        id VARCHAR(36) NOT NULL PRIMARY KEY,
                        username VARCHAR(50) NOT NULL UNIQUE,
                        password_hash VARCHAR(255) NOT NULL,
                        full_name VARCHAR(100) NOT NULL,
                        student_username VARCHAR(100) NOT NULL,
                        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_parents_student_username (student_username)
                    )
                """))
            except Exception as e_pt:
                import logging
                logging.getLogger(__name__).warning(f"parents table creation notice: {e_pt}")

    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Startup DB migration failed: {e}")


@app.get("/")
def read_root():
    # Trigger reload comment v8
    return {
        "message": "Welcome to the Personalized Study Planner API",
        "version": "2.0.0",
    }
