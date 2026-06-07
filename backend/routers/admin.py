from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, and_
from sqlalchemy.orm import selectinload

from backend.deps import require_admin
from backend.core.database import get_db
from backend.models import Profile, Class, ClassSession, AttendanceLog, UserRole
from backend.schemas import UserResponse

router = APIRouter(prefix="/admin", tags=["admin"])

@router.get("/teachers/pending", response_model=List[dict])
async def list_pending_teachers(
    user_id: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    try:
        result = await db.execute(
            select(Profile)
            .where(
                and_(
                    Profile.role == UserRole.teacher,
                    Profile.is_active == False
                )
            )
        )
        teachers = result.scalars().all()
        
        return [
            {
                "id": str(t.id),
                "cms_id": t.cms_id,
                "created_at": t.created_at.isoformat(),
                "is_active": t.is_active
            }
            for t in teachers
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.get("/teachers", response_model=List[dict])
async def list_all_teachers(
    user_id: str = Depends(require_admin),
    active_only: bool = Query(default=True),
    db: AsyncSession = Depends(get_db)
):
    try:
        query = select(Profile).where(Profile.role == UserRole.teacher)
        
        if active_only:
            query = query.where(Profile.is_active == True)
        
        result = await db.execute(query)
        teachers = result.scalars().all()
        
        return [
            {
                "id": str(t.id),
                "cms_id": t.cms_id,
                "created_at": t.created_at.isoformat(),
                "is_active": t.is_active
            }
            for t in teachers
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.put("/teachers/{teacher_id}/approve", response_model=dict)
async def approve_teacher(
    teacher_id: str, 
    user_id: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    try:
        result = await db.execute(select(Profile).where(Profile.id == teacher_id))
        teacher = result.scalars().first()
        
        if not teacher:
            raise HTTPException(status_code=404, detail="Teacher not found")
        
        if teacher.role != UserRole.teacher:
            raise HTTPException(status_code=400, detail="User is not a teacher")
        
        teacher.is_active = True
        await db.commit()
        await db.refresh(teacher)
        
        return {
            "message": "Teacher approved successfully", 
            "teacher": {
                "id": str(teacher.id),
                "cms_id": teacher.cms_id,
                "is_active": teacher.is_active
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.put("/teachers/{teacher_id}/revoke", response_model=dict)
async def revoke_teacher(
    teacher_id: str, 
    user_id: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    try:
        result = await db.execute(select(Profile).where(Profile.id == teacher_id))
        teacher = result.scalars().first()
        
        if not teacher:
            raise HTTPException(status_code=404, detail="Teacher not found")
        
        if teacher.role != UserRole.teacher:
            raise HTTPException(status_code=400, detail="User is not a teacher")
        
        teacher.is_active = False
        await db.commit()
        await db.refresh(teacher)
        
        return {
            "message": "Teacher access revoked successfully", 
            "teacher": {
                "id": str(teacher.id),
                "cms_id": teacher.cms_id,
                "is_active": teacher.is_active
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.get("/attendance-logs", response_model=List[dict])
async def list_attendance_logs(
    user_id: str = Depends(require_admin),
    session_id: Optional[str] = Query(default=None),
    student_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=100, le=1000),
    offset: int = Query(default=0),
    db: AsyncSession = Depends(get_db)
):
    try:
        query = (
            select(AttendanceLog)
            .options(
                selectinload(AttendanceLog.student),
                selectinload(AttendanceLog.session).selectinload(ClassSession.class_)
            )
            .order_by(AttendanceLog.scan_timestamp.desc())
            .offset(offset)
            .limit(limit)
        )
        
        if session_id:
            query = query.where(AttendanceLog.session_id == session_id)
        
        if student_id:
            query = query.where(AttendanceLog.student_id == student_id)
        
        if status:
            query = query.where(AttendanceLog.status == status)
        
        result = await db.execute(query)
        logs = result.scalars().all()
        
        response = []
        for log in logs:
            response.append({
                "id": str(log.id),
                "session_id": str(log.session_id),
                "student_id": str(log.student_id),
                "device_id": log.device_id,
                "verification_status": log.status.value,
                "timestamp": log.scan_timestamp.isoformat(),
                "profiles": {
                    "cms_id": log.student.cms_id
                },
                "class_sessions": {
                    "id": str(log.session.id),
                    "classes": {
                        "course_code": log.session.class_.course_code,
                        "course_name": log.session.class_.course_name
                    }
                }
            })
            
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.get("/attendance-logs/{log_id}", response_model=dict)
async def get_attendance_log_detail(
    log_id: str, 
    user_id: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    try:
        result = await db.execute(
            select(AttendanceLog)
            .options(
                selectinload(AttendanceLog.student),
                selectinload(AttendanceLog.session).selectinload(ClassSession.class_)
            )
            .where(AttendanceLog.id == log_id)
        )
        log = result.scalars().first()
        
        if not log:
            raise HTTPException(status_code=404, detail="Attendance log not found")
        
        return {
            "id": str(log.id),
            "session_id": str(log.session_id),
            "student_id": str(log.student_id),
            "device_id": log.device_id,
            "verification_status": log.status.value,
            "timestamp": log.scan_timestamp.isoformat(),
            "location_data": log.location_data,
            "distance_from_center": log.distance_from_center,
            "liveness_score": log.liveness_score,
            "face_match_score": log.face_match_score,
            "failure_reason": log.failure_reason,
            "raw_verification_data": log.raw_verification_data,
            "profiles": {
                "id": str(log.student.id),
                "cms_id": log.student.cms_id
            },
            "class_sessions": {
                "id": str(log.session.id),
                "classes": {
                    "course_code": log.session.class_.course_code,
                    "course_name": log.session.class_.course_name,
                    "teacher_id": str(log.session.class_.teacher_id)
                }
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.get("/statistics", response_model=dict)
async def get_system_statistics(
    user_id: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    try:
        # Helper to count
        async def count_query(query):
            result = await db.execute(select(func.count()).select_from(query.subquery()))
            return result.scalar()

        total_students = await count_query(select(Profile.id).where(Profile.role == UserRole.student))
        
        total_teachers = await count_query(
            select(Profile.id).where(and_(Profile.role == UserRole.teacher, Profile.is_active == True))
        )
        
        pending_teachers = await count_query(
            select(Profile.id).where(and_(Profile.role == UserRole.teacher, Profile.is_active == False))
        )
        
        total_classes = await count_query(select(Class.id).where(Class.is_active == True))
        
        active_sessions = await count_query(select(ClassSession.id).where(ClassSession.is_active == True))
        
        total_attendance = await count_query(select(AttendanceLog.id))
        
        successful_attendance = await count_query(
            select(AttendanceLog.id).where(AttendanceLog.status == "SUCCESS")
        )
        
        return {
            "total_students": total_students or 0,
            "total_teachers": total_teachers or 0,
            "pending_teachers": pending_teachers or 0,
            "total_classes": total_classes or 0,
            "active_sessions": active_sessions or 0,
            "total_attendance_records": total_attendance or 0,
            "successful_attendance": successful_attendance or 0,
            "success_rate": (successful_attendance / total_attendance * 100) if total_attendance else 0
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.delete("/attendance-logs/{log_id}", status_code=204)
async def delete_attendance_log(
    log_id: str, 
    user_id: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    try:
        result = await db.execute(select(AttendanceLog).where(AttendanceLog.id == log_id))
        log = result.scalars().first()
        
        if log:
            await db.delete(log)
            await db.commit()
            
        return None
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
