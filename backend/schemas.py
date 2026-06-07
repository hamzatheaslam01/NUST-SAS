from pydantic import BaseModel, Field, EmailStr
from typing import Optional, Dict, Any, List
from uuid import UUID
from datetime import datetime

class LocationData(BaseModel):
    lat: float
    lon: float
    accuracy: float
    is_mock: bool

class DeviceInfo(BaseModel):
    id: str
    model: str
    platform: Optional[str] = None

class LivenessMetrics(BaseModel):
    blink_detected: bool
    head_rotation_check: bool
    confidence: float = 1.0
    # Dynamic challenge fields for anti-prerecording
    challenge_type: Optional[str] = None  # e.g., "fingers_left", "look_left_right"
    challenge_param: Optional[int] = None  # e.g., number of fingers (1-5)
    challenge_completed: Optional[bool] = None
    challenge_response_time_ms: Optional[int] = None  # Time taken to respond
    # HMAC signature fields for tamper protection
    challenge_signature: Optional[str] = None  # HMAC-SHA256 signature
    challenge_signature_timestamp_ms: Optional[int] = None  # Timestamp used in signature

class ScanPayload(BaseModel):
    qr_code: str
    location: LocationData
    device: DeviceInfo
    liveness: LivenessMetrics

class RegisterPayload(BaseModel):
    email: EmailStr
    password: str
    cms_id: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[str] = "student"
    device_info: Optional[DeviceInfo] = None

class LoginPayload(BaseModel):
    email: EmailStr
    password: str
    device_info: Optional[DeviceInfo] = None

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str
    user: Dict[str, Any]

class UserResponse(BaseModel):
    id: UUID
    email: str
    role: str
    full_name: Optional[str]
    cms_id: Optional[str]
    is_active: bool

    class Config:
        from_attributes = True

class SessionCreate(BaseModel):
    class_id: UUID
    duration_minutes: int
    latitude: float
    longitude: float
    radius: int = 100
    accuracy: Optional[float] = 10.0

class SessionResponse(BaseModel):
    id: UUID
    class_id: UUID
    start_time: datetime
    end_time: datetime
    geofence_radius_meters: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

class AttendanceVerifyRequest(BaseModel):
    qr_token: str
    location: LocationData
    device_info: DeviceInfo
    liveness_metrics: LivenessMetrics
    face_embedding: Optional[bytes] = None

class AttendanceVerifyResponse(BaseModel):
    success: bool
    status: str
    message: str
    details: Optional[Dict[str, Any]] = None

class ClassCreate(BaseModel):
    course_code: str
    course_name: str
    section: Optional[str] = None
    schedule: Optional[str] = None
    room_id: Optional[str] = None
    default_latitude: Optional[float] = None
    default_longitude: Optional[float] = None

class ClassUpdate(BaseModel):
    course_code: Optional[str] = None
    course_name: Optional[str] = None
    section: Optional[str] = None
    schedule: Optional[str] = None
    room_id: Optional[str] = None
    default_latitude: Optional[float] = None
    default_longitude: Optional[float] = None
    is_active: Optional[bool] = None

class ClassResponse(BaseModel):
    id: UUID
    teacher_id: UUID
    course_code: str
    course_name: str
    section: Optional[str]
    schedule: Optional[str]
    room_id: Optional[str]
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

class ClassEnrollmentCreate(BaseModel):
    student_cms_id: str
    class_id: Optional[UUID] = None # Optional because it might be in the URL

class ClassEnrollmentResponse(BaseModel):
    id: UUID
    student_id: UUID
    class_id: UUID
    enrolled_at: datetime
    enrolled_by: Optional[UUID]

    class Config:
        from_attributes = True

class StudentBulkEnroll(BaseModel):
    class_id: Optional[UUID] = None
    student_cms_ids: List[str]
