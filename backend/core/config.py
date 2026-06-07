from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional

class Settings(BaseSettings):
    # App
    APP_NAME: str = "NUST-SAS Verification Engine"
    DEBUG: bool = False
    
    # Migration Control
    USE_SUPABASE: bool = False
    
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres_password@localhost:5432/nust_sas"
    DB_HOST: str = "localhost"
    DB_NAME: str = "nust_sas"
    DB_USER: str = "postgres"
    DB_PASS: str = "postgres_password"
    DB_PORT: int = 5432

    # Supabase (Optional - only used if USE_SUPABASE=true)
    SUPABASE_URL: Optional[str] = None
    SUPABASE_SERVICE_ROLE_KEY: Optional[str] = None
    SUPABASE_JWT_SECRET: Optional[str] = None
    SUPABASE_ANON_KEY: Optional[str] = None
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # Security
    QR_SECRET_KEY: str
    JWT_SECRET_KEY: str = "change-me-in-prod"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"

@lru_cache()
def get_settings():
    return Settings()
