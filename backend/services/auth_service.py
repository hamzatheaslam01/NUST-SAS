from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status
from backend.models import AuthUser, Profile, UserRole, DeviceRegistry
from backend.schemas import RegisterPayload, LoginPayload, TokenResponse
from backend.services.security import get_password_hash, verify_password, create_access_token, create_refresh_token
from datetime import datetime

async def register_user(db: AsyncSession, payload: RegisterPayload) -> Profile:
    result = await db.execute(select(AuthUser).where(AuthUser.email == payload.email))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Email already registered")
    
    if payload.cms_id:
        result = await db.execute(select(Profile).where(Profile.cms_id == payload.cms_id))
        if result.scalars().first():
            raise HTTPException(status_code=400, detail="CMS ID already registered")

    role = UserRole(payload.role) if payload.role else UserRole.student
    
    auth_user = AuthUser(
        email=payload.email,
        password_hash=get_password_hash(payload.password),
        email_confirmed_at=datetime.utcnow(),
        raw_user_meta_data={
            "cms_id": payload.cms_id or "",
            "role": role.value,
            "full_name": payload.full_name or ""
        }
    )
    
    db.add(auth_user)
    await db.flush()
    
    profile = Profile(
        id=auth_user.id,
        cms_id=payload.cms_id or f"USER{str(auth_user.id)[:8].upper()}",
        role=role,
        is_active=True
    )
    
    db.add(profile)
    
    if payload.device_info:
        device = DeviceRegistry(
            user_id=profile.id,
            device_id=payload.device_info.id,
            model_name=payload.device_info.model,
            os_version=payload.device_info.platform,
            is_primary=True
        )
        db.add(device)
        
    await db.commit()
    
    # Reload profile with auth_user to avoid MissingGreenlet error
    result = await db.execute(
        select(Profile)
        .options(selectinload(Profile.auth_user))
        .where(Profile.id == profile.id)
    )
    profile = result.scalars().first()
    
    return profile

async def authenticate_user(db: AsyncSession, payload: LoginPayload) -> TokenResponse:
    result = await db.execute(
        select(AuthUser)
        .options(selectinload(AuthUser.profile))
        .where(AuthUser.email == payload.email)
    )
    auth_user = result.scalars().first()
    
    if not auth_user or not verify_password(payload.password, auth_user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not auth_user.profile:
        raise HTTPException(status_code=500, detail="User profile not found")
    
    profile = auth_user.profile
    
    if not profile.is_active:
        raise HTTPException(status_code=403, detail="Account is inactive")
        
    if payload.device_info:
        # Check if device exists
        result = await db.execute(
            select(DeviceRegistry).where(
                DeviceRegistry.user_id == profile.id,
                DeviceRegistry.device_id == payload.device_info.id
            )
        )
        existing_device = result.scalars().first()
        
        if not existing_device:
            # STRICT DEVICE POLICY FOR STUDENTS
            # Students can only login from their registered device
            if profile.role == UserRole.student:
                raise HTTPException(
                    status_code=403, 
                    detail="This device is not registered to your account. You can only login from the device you registered with. Contact admin if you need to change your device."
                )
            
            # Teachers and admins can add new devices
            device = DeviceRegistry(
                user_id=profile.id,
                device_id=payload.device_info.id,
                model_name=payload.device_info.model,
                os_version=payload.device_info.platform,
                is_primary=False,
                last_used=datetime.utcnow()
            )
            db.add(device)
            await db.commit()
        else:
            # Update last used
            existing_device.last_used = datetime.utcnow()
            await db.commit()

    access_token = create_access_token(data={"sub": str(profile.id), "role": profile.role.value})
    refresh_token = create_refresh_token(data={"sub": str(profile.id)})
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user={
            "id": str(profile.id),
            "email": auth_user.email,
            "role": profile.role.value,
            "cms_id": profile.cms_id,
            "full_name": auth_user.raw_user_meta_data.get("full_name", "")
        }
    )
