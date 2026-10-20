from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"

class Settings(BaseSettings):
    database_url: str = "mysql+aiomysql://user:password@localhost:3306/new_study_planner"
    groq_api_key: str = ""
    
    # Constants
    EARLY_THRESHOLD: float = 0.15
    LATE_THRESHOLD: float = 0.85
    
    model_config = SettingsConfigDict(env_file=str(ENV_PATH), extra="ignore")

settings = Settings()
