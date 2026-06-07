from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from backend.core.config import get_settings
from backend.core.database import get_db
from backend.models import Profile
from backend.services.security import ALGORITHM

settings = get_settings()
security = HTTPBearer()

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> Profile:
    """
    Validates the JWT Token and returns the current user profile.
    """
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not validate credentials: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    result = await db.execute(
        select(Profile)
        .options(selectinload(Profile.auth_user))
        .where(Profile.id == user_id)
    )
    profile = result.scalars().first()
    
    if profile is None:
        raise HTTPException(status_code=404, detail="User not found")
        
    if not profile.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
        
    return profile

async def require_teacher(current_user: Profile = Depends(get_current_user)) -> Profile:
    """
    Ensures the current user has teacher or admin role.
    """
    from backend.models import UserRole
    if current_user.role not in [UserRole.teacher, UserRole.admin]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Teacher or admin access required"
        )
    return current_user

async def require_admin(current_user: Profile = Depends(get_current_user)) -> Profile:
    """
    Ensures the current user has admin role.
    """
    from backend.models import UserRole
    if current_user.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user
