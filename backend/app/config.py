from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"

from typing import List

class Settings(BaseSettings):
    database_url: str = "mysql+aiomysql://user:password@localhost:3306/new_study_planner"
    groq_api_key: str = ""
    groq_model: str = "qwen/qwen3.8-27b"
    
    # Environment-driven CORS configuration for production website integration
    cors_allowed_origins: str = "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:3000,http://localhost:8080,http://127.0.0.1:8080"
    cors_allow_credentials: bool = True

    @property
    def cors_origins_list(self) -> List[str]:
        if not self.cors_allowed_origins or self.cors_allowed_origins.strip() == "*":
            return ["*"]
        return [origin.strip() for origin in self.cors_allowed_origins.split(",") if origin.strip()]
    
    # Constants
    EARLY_THRESHOLD: float = 0.15
    LATE_THRESHOLD: float = 0.85
    
    model_config = SettingsConfigDict(env_file=str(ENV_PATH), extra="ignore")

settings = Settings()
