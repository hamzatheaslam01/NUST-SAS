from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Enum, Integer, Float, JSON, Text, Index
from sqlalchemy.dialects.postgresql import UUID, BYTEA, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from geoalchemy2 import Geography
import uuid
import enum
from backend.core.database import Base

class UserRole(str, enum.Enum):
    student = "student"
    teacher = "teacher"
    admin = "admin"

class VerificationStatus(str, enum.Enum):
    SUCCESS = "SUCCESS"
    FAIL_TIME = "FAIL_TIME"
    FAIL_GEO = "FAIL_GEO"
    FAIL_DEVICE = "FAIL_DEVICE"
    FAIL_LIVENESS = "FAIL_LIVENESS"
    FAIL_REPLAY = "FAIL_REPLAY"
    MANUAL = "MANUAL"

class AuthUser(Base):
    __tablename__ = "users"
    __table_args__ = {'schema': 'auth'}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    email_confirmed_at = Column(DateTime(timezone=True), nullable=True)
    raw_user_meta_data = Column(JSONB, default={})
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    profile = relationship("Profile", back_populates="auth_user", uselist=False, cascade="all, delete-orphan")

class Profile(Base):
    __tablename__ = "profiles"
    __table_args__ = {'schema': 'public'}

    id = Column(UUID(as_uuid=True), ForeignKey("auth.users.id", ondelete="CASCADE"), primary_key=True)
    cms_id = Column(String(50), unique=True, nullable=False, index=True)
    role = Column(Enum(UserRole, name="user_role"), default=UserRole.student, nullable=False, index=True)
    device_ids = Column(JSONB, default=[])
    face_embedding = Column(BYTEA, nullable=True)
    face_embedding_version = Column(Integer, default=1)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    auth_user = relationship("AuthUser", back_populates="profile")
    devices = relationship("DeviceRegistry", back_populates="user", cascade="all, delete-orphan")
    classes_taught = relationship("Class", back_populates="teacher", foreign_keys="Class.teacher_id")
    enrollments = relationship("ClassEnrollment", back_populates="student", foreign_keys="ClassEnrollment.student_id")
    attendance_logs = relationship("AttendanceLog", back_populates="student", foreign_keys="AttendanceLog.student_id")

class DeviceRegistry(Base):
    __tablename__ = "device_registry"
    __table_args__ = {'schema': 'public'}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("public.profiles.id", ondelete="CASCADE"), nullable=False)
    device_id = Column(Text, nullable=False)
    device_fingerprint = Column(JSONB, nullable=True)
    model_name = Column(Text, nullable=True)
    os_version = Column(Text, nullable=True)
    trusted_since = Column(DateTime(timezone=True), server_default=func.now())
    last_used = Column(DateTime(timezone=True), server_default=func.now())
    is_primary = Column(Boolean, default=False)

    user = relationship("Profile", back_populates="devices")

class Class(Base):
    __tablename__ = "classes"
    __table_args__ = {'schema': 'public'}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    teacher_id = Column(UUID(as_uuid=True), ForeignKey("public.profiles.id", ondelete="CASCADE"), nullable=False)
    course_code = Column(String(20), nullable=False, index=True)
    course_name = Column(String(255), nullable=False)
    section = Column(String(10), nullable=True)
    schedule = Column(JSONB, nullable=True)
    room_id = Column(String(50), nullable=True)
    default_location = Column(Geography(geometry_type='POINT', srid=4326), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    teacher = relationship("Profile", back_populates="classes_taught", foreign_keys=[teacher_id])
    enrollments = relationship("ClassEnrollment", back_populates="class_")
    sessions = relationship("ClassSession", back_populates="class_")

class ClassEnrollment(Base):
    __tablename__ = "class_enrollments"
    __table_args__ = {'schema': 'public'}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    class_id = Column(UUID(as_uuid=True), ForeignKey("public.classes.id", ondelete="CASCADE"), nullable=False)
    student_id = Column(UUID(as_uuid=True), ForeignKey("public.profiles.id", ondelete="CASCADE"), nullable=False)
    enrolled_at = Column(DateTime(timezone=True), server_default=func.now())
    enrolled_by = Column(UUID(as_uuid=True), ForeignKey("public.profiles.id"), nullable=True)
    is_active = Column(Boolean, default=True)

    class_ = relationship("Class", back_populates="enrollments")
    student = relationship("Profile", back_populates="enrollments", foreign_keys=[student_id])

class ClassSession(Base):
    __tablename__ = "class_sessions"
    __table_args__ = {'schema': 'public'}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    class_id = Column(UUID(as_uuid=True), ForeignKey("public.classes.id", ondelete="CASCADE"), nullable=False)
    nonce = Column(Text, unique=True, nullable=False, index=True)
    qr_code = Column(Text, nullable=True)
    qr_expires_at = Column(DateTime(timezone=True), nullable=False)
    start_time = Column(DateTime(timezone=True), nullable=False)
    end_time = Column(DateTime(timezone=True), nullable=False)
    geofence_center = Column(Geography(geometry_type='POINT', srid=4326), nullable=True)
    geofence_radius_meters = Column(Integer, default=100)
    is_active = Column(Boolean, default=True, index=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("public.profiles.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    class_ = relationship("Class", back_populates="sessions")
    attendance_logs = relationship("AttendanceLog", back_populates="session")

class AttendanceLog(Base):
    __tablename__ = "attendance_logs"
    __table_args__ = (
        Index('idx_session_student', 'session_id', 'student_id'),
        {'schema': 'public'}
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("public.class_sessions.id", ondelete="CASCADE"), nullable=False)
    student_id = Column(UUID(as_uuid=True), ForeignKey("public.profiles.id", ondelete="CASCADE"), nullable=False)
    device_id = Column(Text, nullable=False)
    status = Column(Enum(VerificationStatus, name="verification_status"), nullable=False, index=True)
    scan_timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    scan_location = Column(Geography(geometry_type='POINT', srid=4326), nullable=True)
    location_data = Column(JSONB, nullable=True)
    distance_from_center = Column(Float, nullable=True)
    liveness_score = Column(Float, nullable=True)
    face_match_score = Column(Float, nullable=True)
    failure_reason = Column(Text, nullable=True)
    raw_verification_data = Column(JSONB, nullable=True)

    session = relationship("ClassSession", back_populates="attendance_logs")
    student = relationship("Profile", back_populates="attendance_logs")

class AuditTrail(Base):
    __tablename__ = "audit_trail"
    __table_args__ = {'schema': 'public'}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    table_name = Column(Text, nullable=False)
    record_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    operation = Column(Text, nullable=False)
    old_data = Column(JSONB, nullable=True)
    new_data = Column(JSONB, nullable=True)
    changed_by = Column(UUID(as_uuid=True), nullable=True)
    changed_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
