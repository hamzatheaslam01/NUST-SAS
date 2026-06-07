"""
Caching service with Redis primary and in-memory fallback.
Provides fast session lookups for QR verification.
"""
import json
import asyncio
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
from functools import lru_cache


class InMemoryCache:
    """Simple in-memory cache fallback when Redis is unavailable."""
    
    def __init__(self):
        self._cache: Dict[str, tuple[Any, datetime]] = {}
        self._lock = asyncio.Lock()
    
    async def get(self, key: str) -> Optional[str]:
        async with self._lock:
            if key in self._cache:
                value, expires_at = self._cache[key]
                if datetime.utcnow() < expires_at:
                    return value
                else:
                    del self._cache[key]
            return None
    
    async def set(self, key: str, value: str, ttl: int = 30) -> bool:
        async with self._lock:
            expires_at = datetime.utcnow() + timedelta(seconds=ttl)
            self._cache[key] = (value, expires_at)
            return True
    
    async def delete(self, key: str) -> bool:
        async with self._lock:
            if key in self._cache:
                del self._cache[key]
                return True
            return False
    
    async def cleanup_expired(self):
        """Remove expired entries. Call periodically."""
        async with self._lock:
            now = datetime.utcnow()
            expired_keys = [k for k, (_, exp) in self._cache.items() if now >= exp]
            for key in expired_keys:
                del self._cache[key]


class CacheService:
    """
    Hybrid cache service with Redis as primary and in-memory fallback.
    Gracefully degrades to in-memory if Redis is unavailable.
    """
    
    def __init__(self):
        self._redis = None
        self._fallback = InMemoryCache()
        self._redis_available = False
        self._initialized = False
    
    async def initialize(self):
        """Initialize Redis connection. Call once on startup."""
        if self._initialized:
            return
        
        try:
            import redis.asyncio as redis
            from backend.core.config import get_settings
            
            settings = get_settings()
            self._redis = redis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True
            )
            # Test connection
            await self._redis.ping()
            self._redis_available = True
            print("✓ Redis cache connected")
        except Exception as e:
            print(f"⚠ Redis unavailable, using in-memory cache: {e}")
            self._redis_available = False
        
        self._initialized = True
    
    async def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get cached session data."""
        key = f"session:{session_id}"
        
        try:
            if self._redis_available and self._redis:
                data = await self._redis.get(key)
            else:
                data = await self._fallback.get(key)
            
            if data:
                return json.loads(data)
            return None
        except Exception as e:
            print(f"Cache get error: {e}")
            return None
    
    async def set_session(self, session_id: str, data: Dict[str, Any], ttl: int = 30) -> bool:
        """Cache session data with TTL."""
        key = f"session:{session_id}"
        value = json.dumps(data)
        
        try:
            if self._redis_available and self._redis:
                await self._redis.setex(key, ttl, value)
            else:
                await self._fallback.set(key, value, ttl)
            return True
        except Exception as e:
            print(f"Cache set error: {e}")
            return False
    
    async def invalidate_session(self, session_id: str) -> bool:
        """Remove session from cache (e.g., when session ends)."""
        key = f"session:{session_id}"
        
        try:
            if self._redis_available and self._redis:
                await self._redis.delete(key)
            else:
                await self._fallback.delete(key)
            return True
        except Exception as e:
            print(f"Cache invalidate error: {e}")
            return False
    
    async def get_qr_token_usage(self, token_hash: str) -> Optional[str]:
        """Check if QR token nonce has been used (for replay protection)."""
        key = f"qr_used:{token_hash}"
        
        try:
            if self._redis_available and self._redis:
                return await self._redis.get(key)
            else:
                return await self._fallback.get(key)
        except Exception:
            return None
    
    async def mark_qr_token_used(self, token_hash: str, student_id: str, ttl: int = 60) -> bool:
        """Mark QR token as used by a student."""
        key = f"qr_used:{token_hash}"
        
        try:
            if self._redis_available and self._redis:
                await self._redis.setex(key, ttl, student_id)
            else:
                await self._fallback.set(key, student_id, ttl)
            return True
        except Exception:
            return False
    
    async def close(self):
        """Close Redis connection on shutdown."""
        if self._redis:
            await self._redis.close()


# Singleton instance
_cache_service: Optional[CacheService] = None


async def get_cache() -> CacheService:
    """Get the cache service singleton."""
    global _cache_service
    if _cache_service is None:
        _cache_service = CacheService()
        await _cache_service.initialize()
    return _cache_service
