from supabase import create_client, Client
import redis
import os
from backend.core.config import get_settings
from dotenv import load_dotenv

load_dotenv()
settings = get_settings()

# Supabase Setup
if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
    print("Warning: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set.")
    supabase_admin: Client = None
    supabase_anon: Client = None
else:
    supabase_admin: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
    anon_key = os.getenv("SUPABASE_ANON_KEY")
    if anon_key:
        supabase_anon: Client = create_client(settings.SUPABASE_URL, anon_key)
    else:
        print("Warning: SUPABASE_ANON_KEY not set.")
        supabase_anon: Client = None

# Redis Setup
try:
    redis_client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
    # We don't ping here to allow app startup even if Redis is temporarily down, 
    # but check_nonce will fail if it's down.
except Exception as e:
    print(f"Warning: Could not connect to Redis: {e}")
    redis_client = None

def check_nonce(nonce: str) -> bool:
    """
    Returns True if nonce is fresh. 
    Returns False if nonce was already used.
    """
    if not redis_client:
        if settings.DEBUG:
            print("WARNING: Redis not available, skipping nonce check (DEBUG mode).")
            return True
        raise ConnectionError("Redis not available for nonce check")
        
    # atomic setnx (set if not exists)
    try:
        is_fresh = redis_client.setnx(f"nonce:{nonce}", "used")
        if is_fresh:
            # Expire this key after 15 seconds (slightly more than QR lifespan)
            redis_client.expire(f"nonce:{nonce}", 15)
        return bool(is_fresh)
    except Exception as e:
        print(f"Error checking nonce: {e}")
        return False # Fail closed
