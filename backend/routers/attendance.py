from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime
import hmac
import hashlib
import json
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload
from geoalchemy2.shape import from_shape
from shapely.geometry import Point

from backend.schemas import AttendanceVerifyRequest, AttendanceVerifyResponse
from backend.services.verification import verify_attendance
from backend.deps import get_current_user
from backend.core.config import get_settings
from backend.core.database import get_db
from backend.models import AttendanceLog, VerificationStatus, Profile, ClassSession, Class

router = APIRouter(prefix="/attendance", tags=["attendance"])
settings = get_settings()

async def broadcast_attendance(session_id: str, student_id: str, status: str, details: dict = None, student_cms_id: str = None):
    try:
        from backend.routers.websocket import broadcast_attendance_update
        await broadcast_attendance_update(session_id, student_id, status, details, student_cms_id)
    except Exception as e:
        print(f"WebSocket broadcast failed: {str(e)}")

def generate_signature(data: dict) -> str:
    json_data = json.dumps(data, sort_keys=True)
    signature = hmac.new(
        settings.QR_SECRET_KEY.encode(),
        json_data.encode(),
        hashlib.sha256
    ).hexdigest()
    return signature

@router.post("/verify", response_model=AttendanceVerifyResponse)
async def verify_student_attendance(
    request: AttendanceVerifyRequest,
    student: Profile = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        success, status, details = await verify_attendance(
            db=db,
            qr_token=request.qr_token,
            location=request.location,
            device_info=request.device_info,
            liveness_metrics=request.liveness_metrics,
            student_id=str(student.id),
            face_embedding=request.face_embedding
        )
        
        if not success:
            return AttendanceVerifyResponse(
                success=False,
                status=status,
                message=status.split(": ", 1)[1] if ": " in status else status,
                details=details
            )
        
        session_id = details.get("session_id")
        
        # Create AttendanceLog
        point = Point(request.location.lon, request.location.lat)
        scan_location = from_shape(point, srid=4326)
        
        attendance_log = AttendanceLog(
            session_id=session_id,
            student_id=student.id,
            device_id=request.device_info.id,
            status=VerificationStatus.SUCCESS,
            scan_timestamp=datetime.utcnow(),
            scan_location=scan_location,
            location_data={
                "lat": request.location.lat,
                "lon": request.location.lon,
                "accuracy": request.location.accuracy,
                "is_mock": request.location.is_mock
            },
            distance_from_center=details.get("distance_meters"),
            liveness_score=request.liveness_metrics.confidence,
            face_match_score=details.get("biometric_similarity"),
            raw_verification_data={
                "device_fingerprint": {
                    "id": request.device_info.id,
                    "model": request.device_info.model,
                    "platform": request.device_info.platform
                },
                "liveness_data": {
                    "blink_detected": request.liveness_metrics.blink_detected,
                    "head_rotation_check": request.liveness_metrics.head_rotation_check,
                    "confidence": request.liveness_metrics.confidence
                }
            }
        )
        
        db.add(attendance_log)
        await db.commit()
        await db.refresh(attendance_log)
        
        # Prepare record for signature (legacy support or audit)
        attendance_record = {
            "session_id": session_id,
            "student_id": str(student.id),
            "timestamp": attendance_log.scan_timestamp.isoformat(),
            "verification_status": "SUCCESS"
        }
        signature = generate_signature(attendance_record)
        
        # Broadcast update
        asyncio.create_task(broadcast_attendance(
            session_id, 
            str(student.id), 
            "SUCCESS",
            {
                "timestamp": attendance_record["timestamp"],
                "distance_meters": details.get("distance_meters"),
                "biometric_similarity": details.get("biometric_similarity")
            },
            student_cms_id=student.cms_id
        ))
        
        return AttendanceVerifyResponse(
            success=True,
            status="SUCCESS",
            message="Attendance verified and recorded successfully",
            details={
                "attendance_id": str(attendance_log.id),
                "distance_meters": details.get("distance_meters"),
                "biometric_similarity": details.get("biometric_similarity"),
                "signature": signature
            }
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Verification failed: {str(e)}")

@router.get("/history")
async def get_attendance_history(
    student: Profile = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = (
        select(AttendanceLog)
        .where(AttendanceLog.student_id == student.id)
        .order_by(desc(AttendanceLog.scan_timestamp))
        .limit(20)
        .options(
            selectinload(AttendanceLog.session).selectinload(ClassSession.class_)
        )
    )
    result = await db.execute(query)
    logs = result.scalars().all()
    
    return [
        {
            "id": str(log.id),
            "timestamp": log.scan_timestamp,
            "status": log.status,
            "session_id": str(log.session_id),
            "course_name": log.session.class_.course_name if log.session and log.session.class_ else "Unknown Class",
            "course_code": log.session.class_.course_code if log.session and log.session.class_ else "?"
        }
        for log in logs
    ]
