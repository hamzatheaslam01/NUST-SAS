from fastapi import APIRouter, Depends, HTTPException
import jwt
import datetime
import secrets
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from backend.deps import require_teacher
from backend.core.database import get_db
from backend.schemas import SessionCreate, SessionResponse
from sqlalchemy import and_
from backend.models import Profile, Class, ClassSession, AttendanceLog, VerificationStatus, UserRole
from backend.core.config import get_settings

router = APIRouter(prefix="/instructor", tags=["instructor"])
settings = get_settings()

@router.get("/sessions/{session_id}/attendance", response_model=List[dict])
async def get_session_attendance(
    session_id: str, 
    teacher: Profile = Depends(require_teacher),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(ClassSession, Class)
        .join(Class, ClassSession.class_id == Class.id)
        .where(ClassSession.id == session_id)
    )
    row = result.first()
    
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session_obj, class_obj = row
    
    if class_obj.teacher_id != teacher.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    result = await db.execute(
        select(AttendanceLog)
        .options(selectinload(AttendanceLog.student))
        .where(AttendanceLog.session_id == session_id)
        .order_by(AttendanceLog.scan_timestamp.desc())
    )
    logs = result.scalars().all()
    
    response = []
    for log in logs:
        response.append({
            "id": str(log.id),
            "session_id": str(log.session_id),
            "student_id": str(log.student_id),
            "timestamp": log.scan_timestamp.isoformat(),
            "verification_status": log.status.value,
            "location_data": log.location_data,
            "device_fingerprint": log.raw_verification_data.get("device_fingerprint") if log.raw_verification_data else None,
            "liveness_data": log.raw_verification_data.get("liveness_data") if log.raw_verification_data else None,
            "face_similarity_score": log.face_match_score,
            "distance_from_center": log.distance_from_center,
            "failure_reason": log.failure_reason,
            "profiles": {
                "cms_id": log.student.cms_id
            }
        })
    return response

@router.post("/sessions/{session_id}/mark-attendance", response_model=dict)
async def mark_attendance_manual(
    session_id: str, 
    payload: dict, 
    teacher: Profile = Depends(require_teacher),
    db: AsyncSession = Depends(get_db)
):
    student_cms_id = payload.get("student_cms_id")
    if not student_cms_id:
        raise HTTPException(status_code=400, detail="student_cms_id is required")

    result = await db.execute(
        select(ClassSession, Class)
        .join(Class, ClassSession.class_id == Class.id)
        .where(ClassSession.id == session_id)
    )
    row = result.first()
    
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session_obj, class_obj = row
    
    if class_obj.teacher_id != teacher.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Find student
    result = await db.execute(select(Profile).where(Profile.cms_id == student_cms_id))
    student = result.scalars().first()
    
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    if student.role != UserRole.student:
        raise HTTPException(status_code=400, detail="User is not a student")
    
    # Check if already marked
    result = await db.execute(
        select(AttendanceLog)
        .where(
            and_(
                AttendanceLog.session_id == session_id,
                AttendanceLog.student_id == student.id,
                AttendanceLog.status == VerificationStatus.SUCCESS
            )
        )
    )
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Attendance already marked")
    
    # Create log
    log = AttendanceLog(
        session_id=session_id,
        student_id=student.id,
        device_id="MANUAL",
        status=VerificationStatus.MANUAL,
        scan_timestamp=datetime.datetime.now(datetime.timezone.utc),
        failure_reason="Marked manually by instructor"
    )
    
    db.add(log)
    await db.commit()
    await db.refresh(log)
    
    return {"message": "Attendance marked successfully", "log_id": str(log.id)}


@router.post("/sessions", response_model=dict)
async def create_session(
    session: SessionCreate, 
    teacher: Profile = Depends(require_teacher),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Class).where(Class.id == session.class_id))
    class_obj = result.scalars().first()
    
    if not class_obj:
        raise HTTPException(status_code=404, detail="Class not found")
    
    if class_obj.teacher_id != teacher.id:
        raise HTTPException(status_code=403, detail="Not authorized to create session for this class")

    starts_at = datetime.datetime.now(datetime.timezone.utc)
    ends_at = starts_at + datetime.timedelta(minutes=session.duration_minutes)
    
    point = Point(session.longitude, session.latitude)
    geofence_center = from_shape(point, srid=4326)
    
    nonce = secrets.token_hex(16)
    
    class_session = ClassSession(
        class_id=session.class_id,
        nonce=nonce,
        qr_expires_at=starts_at + datetime.timedelta(seconds=20),
        start_time=starts_at,
        end_time=ends_at,
        geofence_center=geofence_center,
        geofence_radius_meters=session.radius,
        is_active=True,
        created_by=teacher.id
    )
    
    db.add(class_session)
    await db.commit()
    await db.refresh(class_session)
    
    return {
        "session_id": str(class_session.id),
        "session": {
            "id": str(class_session.id),
            "class_id": str(class_session.class_id),
            "start_time": class_session.start_time.isoformat(),
            "end_time": class_session.end_time.isoformat(),
            "geofence_radius_meters": class_session.geofence_radius_meters,
            "is_active": class_session.is_active
        }
    }

@router.get("/sessions", response_model=List[dict])
async def list_sessions(
    teacher: Profile = Depends(require_teacher),
    active_only: bool = True,
    db: AsyncSession = Depends(get_db)
):
    query = (
        select(ClassSession, Class)
        .join(Class, ClassSession.class_id == Class.id)
        .where(Class.teacher_id == teacher.id)
        .order_by(ClassSession.start_time.desc())
    )
    
    if active_only:
        query = query.where(ClassSession.is_active == True)
    
    result = await db.execute(query)
    sessions = []
    
    for session, class_obj in result.all():
        sessions.append({
            "id": str(session.id),
            "class_id": str(session.class_id),
            "start_time": session.start_time.isoformat(),
            "end_time": session.end_time.isoformat(),
            "geofence_radius_meters": session.geofence_radius_meters,
            "is_active": session.is_active,
            "created_at": session.created_at.isoformat(),
            "classes": {
                "teacher_id": str(class_obj.teacher_id),
                "course_code": class_obj.course_code,
                "course_name": class_obj.course_name
            }
        })
    
    return sessions

@router.get("/sessions/{session_id}", response_model=dict)
async def get_session(
    session_id: str, 
    teacher: Profile = Depends(require_teacher),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(ClassSession, Class)
        .join(Class, ClassSession.class_id == Class.id)
        .where(ClassSession.id == session_id)
    )
    row = result.first()
    
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session_obj, class_obj = row
    
    if class_obj.teacher_id != teacher.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    return {
        "id": str(session_obj.id),
        "class_id": str(session_obj.class_id),
        "start_time": session_obj.start_time.isoformat(),
        "end_time": session_obj.end_time.isoformat(),
        "geofence_radius_meters": session_obj.geofence_radius_meters,
        "is_active": session_obj.is_active,
        "created_at": session_obj.created_at.isoformat(),
        "classes": {
            "teacher_id": str(class_obj.teacher_id),
            "course_code": class_obj.course_code,
            "course_name": class_obj.course_name
        }
    }

@router.post("/sessions/{session_id}/end", response_model=dict)
async def end_session(
    session_id: str, 
    teacher: Profile = Depends(require_teacher),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(ClassSession, Class)
        .join(Class, ClassSession.class_id == Class.id)
        .where(ClassSession.id == session_id)
    )
    row = result.first()
    
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session_obj, class_obj = row
    
    if class_obj.teacher_id != teacher.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    session_obj.is_active = False
    session_obj.end_time = datetime.datetime.now(datetime.timezone.utc)
    
    await db.commit()
    await db.refresh(session_obj)
    
    return {
        "message": "Session ended successfully",
        "session": {
            "id": str(session_obj.id),
            "class_id": str(session_obj.class_id),
            "is_active": session_obj.is_active,
            "end_time": session_obj.end_time.isoformat()
        }
    }

@router.post("/sessions/{session_id}/generate-qr")
async def generate_qr(
    session_id: str, 
    teacher: Profile = Depends(require_teacher),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(ClassSession, Class)
        .join(Class, ClassSession.class_id == Class.id)
        .where(ClassSession.id == session_id)
    )
    row = result.first()
    
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session_obj, class_obj = row
    
    if class_obj.teacher_id != teacher.id:
        raise HTTPException(status_code=403, detail="Not authorized for this session")
    
    qr_secret = settings.QR_SECRET_KEY
    if not qr_secret:
        raise HTTPException(status_code=500, detail="Server misconfiguration: Missing QR Secret")

    nonce = secrets.token_hex(8)
    challenge_seed = secrets.token_hex(4)  # 8 hex chars for unpredictable challenge
    payload = {
        "session_id": session_id,
        "nonce": nonce,
        "challenge_seed": challenge_seed,  # Determines random liveness challenge
        "exp": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=30),
        "iat": datetime.datetime.now(datetime.timezone.utc)
    }
    token = jwt.encode(payload, qr_secret, algorithm="HS256")
    # Return 20s to frontend to ensure refresh happens well before 30s expiry (latency buffer)
    return {"qr_token": token, "expires_in": 20}
