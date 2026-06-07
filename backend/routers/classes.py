from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import and_
from geoalchemy2.shape import from_shape
from shapely.geometry import Point

from backend.deps import get_current_user, require_teacher, require_admin
from backend.core.database import get_db
from backend.models import Class, ClassEnrollment, Profile, UserRole
from backend.schemas import (
    ClassCreate, ClassUpdate, ClassResponse, 
    ClassEnrollmentCreate, ClassEnrollmentResponse,
    StudentBulkEnroll
)

router = APIRouter(prefix="/classes", tags=["classes"])

@router.post("", response_model=ClassResponse, status_code=status.HTTP_201_CREATED)
async def create_class(
    class_data: ClassCreate, 
    teacher: Profile = Depends(require_teacher),
    db: AsyncSession = Depends(get_db)
):
    default_location = None
    if class_data.default_latitude and class_data.default_longitude:
        point = Point(class_data.default_longitude, class_data.default_latitude)
        default_location = from_shape(point, srid=4326)
    
    new_class = Class(
        teacher_id=teacher.id,
        course_code=class_data.course_code,
        course_name=class_data.course_name,
        section=class_data.section,
        schedule=class_data.schedule, # Assuming JSON compatible
        room_id=class_data.room_id,
        default_location=default_location,
        is_active=True
    )
    
    db.add(new_class)
    await db.commit()
    await db.refresh(new_class)
    
    return new_class

@router.get("", response_model=List[ClassResponse])
async def list_classes(
    user: Profile = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        if user.role in [UserRole.teacher, UserRole.admin]:
            result = await db.execute(
                select(Class)
                .where(Class.teacher_id == user.id)
            )
            return result.scalars().all()
        else:
            # Student: get classes they are enrolled in
            result = await db.execute(
                select(Class)
                .join(ClassEnrollment, Class.id == ClassEnrollment.class_id)
                .where(
                    and_(
                        ClassEnrollment.student_id == user.id,
                        Class.is_active == True
                    )
                )
            )
            return result.scalars().all()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.get("/{class_id}", response_model=ClassResponse)
async def get_class(
    class_id: str, 
    user: Profile = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        result = await db.execute(select(Class).where(Class.id == class_id))
        class_obj = result.scalars().first()
        
        if not class_obj:
            raise HTTPException(status_code=404, detail="Class not found")
        
        if class_obj.teacher_id != user.id:
            # Check enrollment if not teacher
            result = await db.execute(
                select(ClassEnrollment)
                .where(
                    and_(
                        ClassEnrollment.class_id == class_id,
                        ClassEnrollment.student_id == user.id
                    )
                )
            )
            enrollment = result.scalars().first()
            
            if not enrollment:
                raise HTTPException(status_code=403, detail="Access denied")
        
        return class_obj
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.put("/{class_id}", response_model=ClassResponse)
async def update_class(
    class_id: str, 
    class_data: ClassUpdate, 
    teacher: Profile = Depends(require_teacher),
    db: AsyncSession = Depends(get_db)
):
    try:
        result = await db.execute(select(Class).where(Class.id == class_id))
        class_obj = result.scalars().first()
        
        if not class_obj:
            raise HTTPException(status_code=404, detail="Class not found")
        
        if class_obj.teacher_id != teacher.id:
            raise HTTPException(status_code=403, detail="Not authorized to update this class")
        
        update_data = class_data.model_dump(exclude_unset=True)
        
        if "default_latitude" in update_data and "default_longitude" in update_data:
            point = Point(update_data['default_longitude'], update_data['default_latitude'])
            class_obj.default_location = from_shape(point, srid=4326)
            del update_data["default_latitude"]
            del update_data["default_longitude"]
        
        for key, value in update_data.items():
            if hasattr(class_obj, key):
                setattr(class_obj, key, value)
        
        await db.commit()
        await db.refresh(class_obj)
        
        return class_obj
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.delete("/{class_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_class(
    class_id: str, 
    teacher: Profile = Depends(require_teacher),
    db: AsyncSession = Depends(get_db)
):
    try:
        result = await db.execute(select(Class).where(Class.id == class_id))
        class_obj = result.scalars().first()
        
        if not class_obj:
            raise HTTPException(status_code=404, detail="Class not found")
        
        if class_obj.teacher_id != teacher.id:
            raise HTTPException(status_code=403, detail="Not authorized to delete this class")
        
        await db.delete(class_obj)
        await db.commit()
        return None
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.post("/{class_id}/enroll", response_model=ClassEnrollmentResponse, status_code=status.HTTP_201_CREATED)
async def enroll_student(
    class_id: str, 
    enrollment: ClassEnrollmentCreate, 
    teacher: Profile = Depends(require_teacher),
    db: AsyncSession = Depends(get_db)
):
    try:
        result = await db.execute(select(Class).where(Class.id == class_id))
        class_obj = result.scalars().first()
        
        if not class_obj:
            raise HTTPException(status_code=404, detail="Class not found")
        
        if class_obj.teacher_id != teacher.id:
            raise HTTPException(status_code=403, detail="Not authorized to enroll students in this class")
        
        # Find student by CMS ID
        result = await db.execute(select(Profile).where(Profile.cms_id == enrollment.student_cms_id))
        student = result.scalars().first()
        
        if not student:
            raise HTTPException(status_code=404, detail="Student not found")
        
        if student.role != UserRole.student:
            raise HTTPException(status_code=400, detail="User is not a student")
        
        # Check if already enrolled
        result = await db.execute(
            select(ClassEnrollment)
            .where(
                and_(
                    ClassEnrollment.class_id == class_id,
                    ClassEnrollment.student_id == student.id
                )
            )
        )
        if result.scalars().first():
             raise HTTPException(status_code=400, detail="Student already enrolled in this class")

        new_enrollment = ClassEnrollment(
            class_id=class_id,
            student_id=student.id,
            enrolled_by=teacher.id,
            is_active=True
        )
        
        db.add(new_enrollment)
        await db.commit()
        await db.refresh(new_enrollment)
        
        return new_enrollment
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.post("/{class_id}/enroll/bulk", response_model=dict)
async def bulk_enroll_students(
    class_id: str, 
    bulk_data: StudentBulkEnroll, 
    teacher: Profile = Depends(require_teacher),
    db: AsyncSession = Depends(get_db)
):
    try:
        result = await db.execute(select(Class).where(Class.id == class_id))
        class_obj = result.scalars().first()
        
        if not class_obj:
            raise HTTPException(status_code=404, detail="Class not found")
        
        if class_obj.teacher_id != teacher.id:
            raise HTTPException(status_code=403, detail="Not authorized to enroll students in this class")
        
        enrolled = []
        failed = []
        
        for cms_id in bulk_data.student_cms_ids:
            try:
                result = await db.execute(select(Profile).where(Profile.cms_id == cms_id))
                student = result.scalars().first()
                
                if not student:
                    failed.append({"id": cms_id, "reason": "Student not found"})
                    continue
                
                if student.role != UserRole.student:
                    failed.append({"id": cms_id, "reason": "User is not a student"})
                    continue
                
                # Check existing
                result = await db.execute(
                    select(ClassEnrollment)
                    .where(
                        and_(
                            ClassEnrollment.class_id == class_id,
                            ClassEnrollment.student_id == student.id
                        )
                    )
                )
                if result.scalars().first():
                    failed.append({"id": cms_id, "reason": "Already enrolled"})
                    continue
                
                new_enrollment = ClassEnrollment(
                    class_id=class_id,
                    student_id=student.id,
                    enrolled_by=teacher.id,
                    is_active=True
                )
                db.add(new_enrollment)
                enrolled.append(cms_id)
                
            except Exception as e:
                failed.append({"id": cms_id, "reason": str(e)})
        
        await db.commit()
        
        return {
            "enrolled_count": len(enrolled),
            "failed_count": len(failed),
            "enrolled": enrolled,
            "failed": failed
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.get("/{class_id}/enrollments", response_model=List[dict])
async def list_class_enrollments(
    class_id: str, 
    user: Profile = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        result = await db.execute(select(Class).where(Class.id == class_id))
        class_obj = result.scalars().first()
        
        if not class_obj:
            raise HTTPException(status_code=404, detail="Class not found")
        
        if class_obj.teacher_id != user.id:
            raise HTTPException(status_code=403, detail="Not authorized to view enrollments")
        
        result = await db.execute(
            select(ClassEnrollment)
            .options(selectinload(ClassEnrollment.student))
            .where(
                and_(
                    ClassEnrollment.class_id == class_id,
                    ClassEnrollment.is_active == True
                )
            )
        )
        enrollments = result.scalars().all()
        
        # Format response to match expected dict structure or use schema
        # The old code returned dicts with profile info.
        # I should probably return a list of dicts or update schema.
        # The endpoint definition says response_model=List[dict].
        
        response = []
        for enrollment in enrollments:
            response.append({
                "id": str(enrollment.id),
                "class_id": str(enrollment.class_id),
                "student_id": str(enrollment.student_id),
                "enrolled_at": enrollment.enrolled_at.isoformat(),
                "is_active": enrollment.is_active,
                "profiles": {
                    "id": str(enrollment.student.id),
                    "cms_id": enrollment.student.cms_id
                }
            })
            
        return response
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.delete("/{class_id}/enrollments/{enrollment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_enrollment(
    class_id: str, 
    enrollment_id: str, 
    teacher: Profile = Depends(require_teacher),
    db: AsyncSession = Depends(get_db)
):
    try:
        result = await db.execute(select(Class).where(Class.id == class_id))
        class_obj = result.scalars().first()
        
        if not class_obj:
            raise HTTPException(status_code=404, detail="Class not found")
        
        if class_obj.teacher_id != teacher.id:
            raise HTTPException(status_code=403, detail="Not authorized")
        
        result = await db.execute(select(ClassEnrollment).where(ClassEnrollment.id == enrollment_id))
        enrollment = result.scalars().first()
        
        if enrollment and enrollment.class_id == class_obj.id:
            await db.delete(enrollment)
            await db.commit()
            
        return None
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
