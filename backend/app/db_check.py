import asyncio
import logging
from sqlalchemy import text
from app.database import engine

logger = logging.getLogger("db_check")

async def run_db_check():
    report_lines = []
    report_lines.append("=== AuraStudy Database Connection Check ===")
    
    try:
        async with engine.connect() as conn:
            report_lines.append("1. Connection: SUCCESSFUL")
            
            # Check current database name
            db_name_res = await conn.execute(text("SELECT DATABASE()"))
            db_name = db_name_res.scalar()
            report_lines.append(f"2. Current Database: {db_name}")
            
            # Check list of tables
            tables_res = await conn.execute(text("SHOW TABLES"))
            tables = [row[0] for row in tables_res.fetchall()]
            report_lines.append(f"3. Existing Tables ({len(tables)}): {', '.join(tables)}")
            
            # Query row counts for each key table
            report_lines.append("\n4. Table Row Counts:")
            target_tables = [
                "xxed_user_profile_tab",
                "xxed_user_assessment_data",
                "xxed_user_answer_data",
                "xxed_assessments_tab",
                "xxed_academic_question_tab",
                "xxed_aptitude_question_tab",
                "xxed_chapter_mastery_tab",
                "xxed_standards_tab",
                "xxed_subjects_data",
                "xxed_chapters_data",
                "xxed_daily_plan_tasks_tab",
                "xxed_syllabus_progress_tab",
                "student_profiles", 
                "diagnostic_sessions", 
                "diagnostic_responses", 
                "diagnostic_reports",
                "academic_questions", 
                "aptitude_questions",
                "chapter_mastery",
                "standards",
                "subjects",
                "chapters"
            ]
            
            for t in target_tables:
                if t in tables:
                    try:
                        count_res = await conn.execute(text(f"SELECT COUNT(*) FROM `{t}`"))
                        count = count_res.scalar()
                        report_lines.append(f"   - {t}: {count} rows")
                    except Exception as ex:
                        report_lines.append(f"   - {t}: Error counting rows: {ex}")
                else:
                    report_lines.append(f"   - {t}: NOT FOUND in database")
                    
            # Check if there are any responses and list a sample
            if "diagnostic_responses" in tables:
                try:
                    sample_res = await conn.execute(text("SELECT * FROM `diagnostic_responses` LIMIT 5"))
                    samples = sample_res.fetchall()
                    report_lines.append(f"\n5. Diagnostic Responses sample (first 5 rows):")
                    if not samples:
                        report_lines.append("   (Table is empty)")
                    else:
                        for row in samples:
                            report_lines.append(f"   - {dict(row._mapping)}")
                except Exception as ex:
                    report_lines.append(f"\n5. Error querying diagnostic_responses sample: {ex}")
            
            # Check if there are any sessions and list their status
            if "diagnostic_sessions" in tables:
                try:
                    sessions_res = await conn.execute(text("SELECT status, COUNT(*) as count FROM `diagnostic_sessions` GROUP BY status"))
                    session_counts = sessions_res.fetchall()
                    report_lines.append("\n6. Diagnostic Sessions by Status:")
                    if not session_counts:
                        report_lines.append("   (No sessions found)")
                    else:
                        for row in session_counts:
                            report_lines.append(f"   - {row.status}: {row.count}")
                except Exception as ex:
                    report_lines.append(f"\n6. Error querying diagnostic_sessions: {ex}")

            # Check columns of relevant tables to verify structure
            for table_name in ["student_profiles", "chapter_assessments", "chapter_assessment_items", "chapter_assessment_responses", "chapter_question_bank"]:
                if table_name in tables:
                    try:
                        col_res = await conn.execute(text(f"SHOW COLUMNS FROM `{table_name}`"))
                        columns = [row[0] for row in col_res.fetchall()]
                        report_lines.append(f"\n- {table_name} columns: {', '.join(columns)}")
                    except Exception as ex:
                        report_lines.append(f"\n- {table_name} error: {ex}")
                    
                    
    except Exception as e:
        report_lines.append("1. Connection: FAILED")
        report_lines.append(f"Error Details: {str(e)}")
        report_lines.append("\nTroubleshooting Suggestions:")
        report_lines.append("- Make sure MySQL Server is running on localhost:3306.")
        report_lines.append("- Check if the credentials in 'app/config.py' (or your environment variables) are correct.")
        report_lines.append("- Ensure that the 'study_planner' database exists. If not, create it using 'CREATE DATABASE study_planner;'.")
        report_lines.append("- Import the SQL schema and data using the file 'database/new_changes_11-08-2026.sql'.")

    # Write the report to a file
    import os
    report_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "db_check_results.txt")
    try:
        with open(report_path, "w", encoding="utf-8") as f:
            f.write("\n".join(report_lines))
        logger.info(f"Database check completed. Report written to {report_path}")
    except Exception as e:
        logger.error(f"Failed to write DB check report to {report_path}: {e}")

def run_db_check_sync():
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
    if loop.is_running():
        # Schedule in the existing loop
        loop.create_task(run_db_check())
    else:
        loop.run_until_complete(run_db_check())
