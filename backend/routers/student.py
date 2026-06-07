from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
import jwt
import datetime
import hmac
import hashlib
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, text
from geoalchemy2.shape import from_shape
from shapely.geometry import Point

from backend.deps import get_current_user
from backend.database import check_nonce
from backend.core.database import get_db
from backend.schemas import ScanPayload
from backend.core.config import get_settings
from backend.models import Profile, DeviceRegistry, AttendanceLog, VerificationStatus

router = APIRouter()
settings = get_settings()

async def verify_location_rpc(db: AsyncSession, lat: float, lon: float, session_id: str):
    # Call the PostgreSQL function check_geofence_status
    # Function signature: check_geofence_status(scan_lat, scan_lon, target_session_id)
    # Returns TABLE(is_inside BOOLEAN, distance_meters FLOAT)
    
    try:
        result = await db.execute(
            text("SELECT * FROM check_geofence_status(:lat, :lon, :sid)"),
            {"lat": lat, "lon": lon, "sid": session_id}
        )
        row = result.first()
        
        if not row or not row.is_inside:
            raise ValueError(f"Outside Classroom Geofence (Distance: {row.distance_meters if row else 'Unknown'}m)")
        
        return True
    except Exception as e:
        if "Outside Classroom Geofence" in str(e):
            raise
        raise ValueError(f"Location verification error: {str(e)}")

@router.post("/scan")
async def submit_scan(
    payload: ScanPayload, 
    user: Profile = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    qr_secret = settings.QR_SECRET_KEY
    if not qr_secret:
        raise HTTPException(status_code=500, detail="Server misconfiguration: Missing QR Secret")

    # 1. Decode QR & Check Time
    try:
        qr_data = jwt.decode(payload.qr_code, qr_secret, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        return JSONResponse(status_code=400, content={"error": "QR Expired"})
    except jwt.InvalidTokenError:
        return JSONResponse(status_code=400, content={"error": "Invalid QR"})
        
    # 2. Check Replay (Redis)
    nonce = qr_data.get('nonce')
    if not nonce or not check_nonce(nonce):
        return JSONResponse(status_code=409, content={"error": "Replay Attack Detected"})

    # 3. Check Location (PostGIS)
    if payload.location.is_mock:
            return JSONResponse(status_code=400, content={"error": "Mock Location Detected"})
    
    lat = payload.location.lat
    lon = payload.location.lon
    sid = qr_data.get('session_id') or qr_data.get('sid')

    if lat is None or lon is None or sid is None:
         return JSONResponse(status_code=400, content={"error": "Invalid payload: Missing location or session ID"})

    try:
        await verify_location_rpc(db, lat, lon, sid)
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"Location verification failed: {str(e)}"})

    # 4. Check Identity & Biometrics (Python Logic)
    # Liveness Check
    liveness = payload.liveness
    if not liveness.blink_detected or not liveness.head_rotation_check:
         return JSONResponse(status_code=400, content={"error": "Liveness Check Failed: Blink or Rotation missing"})

    # Identity Check (Device Binding)
    device_id = payload.device.id
    model_name = payload.device.model
    
    # Check if user has any devices registered
    result = await db.execute(select(DeviceRegistry).where(DeviceRegistry.user_id == user.id))
    existing_devices = result.scalars().all()
    
    if not existing_devices:
        # TOFU: Register this device
        try:
            new_device = DeviceRegistry(
                user_id=user.id,
                device_id=device_id,
                model_name=model_name,
                is_primary=True
            )
            db.add(new_device)
            await db.commit()
        except Exception as e:
             # Handle race condition or other errors
             return JSONResponse(status_code=500, content={"error": f"Device registration failed: {str(e)}"})
    else:
        # Check if THIS device is in the list
        is_registered = any(d.device_id == device_id for d in existing_devices)
        if not is_registered:
             return JSONResponse(status_code=403, content={"error": "Device not registered. Please use your registered device."})

    # 5. Success - Write to DB
    timestamp = datetime.datetime.now(datetime.timezone.utc)
    
    # Generate Cryptographic Signature
    # Sign the session_id, student_id, and timestamp
    sign_payload = f"{sid}:{user.id}:{timestamp.isoformat()}"
    signature = hmac.new(
        qr_secret.encode(), 
        sign_payload.encode(), 
        hashlib.sha256
    ).hexdigest()

    point = Point(lon, lat)
    scan_location = from_shape(point, srid=4326)

    attendance_log = AttendanceLog(
        session_id=sid,
        student_id=user.id,
        device_id=device_id,
        status=VerificationStatus.SUCCESS,
        scan_timestamp=timestamp,
        scan_location=scan_location,
        location_data={
            "lat": lat,
            "lon": lon,
            "accuracy": payload.location.accuracy,
            "is_mock": payload.location.is_mock
        },
        liveness_score=liveness.confidence,
        # face_match_score is not calculated here in this endpoint version?
        # The original code didn't calculate it here either, just liveness.
        raw_verification_data={
            "verification_flags": {"all_checks_passed": True},
            "cryptographic_signature": signature
        }
    )
    
    try:
        db.add(attendance_log)
        await db.commit()
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"Failed to record attendance: {str(e)}"})

    return {"status": "marked", "timestamp": timestamp.isoformat()}
