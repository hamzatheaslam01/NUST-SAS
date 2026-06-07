from fastapi import APIRouter, HTTPException, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from backend.core.database import get_db
from backend.schemas import RegisterPayload, LoginPayload, TokenResponse, UserResponse
from backend.services import auth_service
from backend.deps import get_current_user
from backend.models import Profile

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/register", response_model=UserResponse)
async def register_user(payload: RegisterPayload, db: AsyncSession = Depends(get_db)):
    """
    Register a new user (Student/Instructor).
    """
    profile = await auth_service.register_user(db, payload)
    return UserResponse(
        id=profile.id,
        email=profile.auth_user.email if profile.auth_user else "",
        role=profile.role.value,
        full_name=profile.auth_user.raw_user_meta_data.get("full_name", "") if profile.auth_user else "",
        cms_id=profile.cms_id,
        is_active=profile.is_active
    )

@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginPayload, db: AsyncSession = Depends(get_db)):
    """
    Authenticate user and return JWT tokens.
    """
    return await auth_service.authenticate_user(db, payload)

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: Profile = Depends(get_current_user)):
    """
    Get current authenticated user profile.
    """
    return UserResponse(
        id=current_user.id,
        email=current_user.auth_user.email if current_user.auth_user else "",
        role=current_user.role.value,
        full_name=current_user.auth_user.raw_user_meta_data.get("full_name", "") if current_user.auth_user else "",
        cms_id=current_user.cms_id,
        is_active=current_user.is_active
    )
