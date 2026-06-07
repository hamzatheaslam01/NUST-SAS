-- PostgreSQL Standalone Schema for NUST-SAS
-- This schema is independent of Supabase Auth system

-- Enable Extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing objects
DROP SCHEMA IF EXISTS auth CASCADE;
DROP TABLE IF EXISTS public.audit_trail CASCADE;
DROP TABLE IF EXISTS public.attendance_logs CASCADE;
DROP TABLE IF EXISTS public.class_sessions CASCADE;
DROP TABLE IF EXISTS public.class_enrollments CASCADE;
DROP TABLE IF EXISTS public.classes CASCADE;
DROP TABLE IF EXISTS public.device_registry CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

-- Custom ENUM types
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('student', 'teacher', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE verification_status AS ENUM (
        'SUCCESS',
        'FAIL_TIME',
        'FAIL_GEO',
        'FAIL_DEVICE',
        'FAIL_LIVENESS',
        'FAIL_REPLAY'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- Authentication Schema (Standalone)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE auth.users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email_confirmed_at TIMESTAMPTZ,
    raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_users_email ON auth.users(email);

-- ============================================================================
-- User Profiles
-- ============================================================================
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    cms_id VARCHAR(50) UNIQUE NOT NULL,
    role user_role NOT NULL DEFAULT 'student',
    
    -- Security fields
    device_ids JSONB DEFAULT '[]'::jsonb,
    
    -- Biometric data
    face_embedding BYTEA,
    face_embedding_version INT DEFAULT 1,
    
    -- Metadata
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    CONSTRAINT device_ids_is_array CHECK (jsonb_typeof(device_ids) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_profiles_cms_id ON public.profiles(cms_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- Device Registry
CREATE TABLE public.device_registry (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    device_fingerprint JSONB,
    model_name TEXT,
    os_version TEXT,
    trusted_since TIMESTAMPTZ DEFAULT now(),
    last_used TIMESTAMPTZ DEFAULT now(),
    is_primary BOOLEAN DEFAULT false,
    
    UNIQUE(user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_device_registry_user_id ON public.device_registry(user_id);

-- ============================================================================
-- Classes & Sessions
-- ============================================================================
CREATE TABLE public.classes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    teacher_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    course_code VARCHAR(20) NOT NULL,
    course_name VARCHAR(255) NOT NULL,
    section VARCHAR(10),
    schedule JSONB,
    room_id VARCHAR(50),
    default_location GEOGRAPHY(POINT),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_classes_teacher_id ON public.classes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_classes_course_code ON public.classes(course_code);

-- Class Enrollments
CREATE TABLE public.class_enrollments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE NOT NULL,
    student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    enrolled_at TIMESTAMPTZ DEFAULT now(),
    enrolled_by UUID REFERENCES public.profiles(id),
    is_active BOOLEAN DEFAULT true,
    
    CONSTRAINT unique_enrollment UNIQUE (class_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_enrollments_class_id ON public.class_enrollments(class_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_student_id ON public.class_enrollments(student_id);

-- Class Sessions
CREATE TABLE public.class_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE NOT NULL,
    nonce TEXT UNIQUE NOT NULL,
    qr_code TEXT,
    qr_expires_at TIMESTAMPTZ NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    geofence_center GEOGRAPHY(POINT),
    geofence_radius_meters INT DEFAULT 100,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_class_id ON public.class_sessions(class_id);
CREATE INDEX IF NOT EXISTS idx_sessions_nonce ON public.class_sessions(nonce);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON public.class_sessions(is_active, start_time, end_time);

-- ============================================================================
-- Attendance & Audit
-- ============================================================================
CREATE TABLE public.attendance_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID REFERENCES public.class_sessions(id) ON DELETE CASCADE NOT NULL,
    student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    device_id TEXT NOT NULL,
    status verification_status NOT NULL,
    scan_timestamp TIMESTAMPTZ DEFAULT now(),
    scan_location GEOGRAPHY(POINT),
    location_data JSONB,
    distance_from_center FLOAT,
    liveness_score FLOAT,
    face_match_score FLOAT,
    failure_reason TEXT,
    raw_verification_data JSONB,
    
    CONSTRAINT unique_attendance UNIQUE (session_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_session_id ON public.attendance_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON public.attendance_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_status ON public.attendance_logs(status);
CREATE INDEX IF NOT EXISTS idx_attendance_timestamp ON public.attendance_logs(scan_timestamp);

-- Audit Trail
CREATE TABLE public.audit_trail (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    table_name TEXT NOT NULL,
    record_id UUID NOT NULL,
    operation TEXT NOT NULL,
    old_data JSONB,
    new_data JSONB,
    changed_by UUID,
    changed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_trail_record_id ON public.audit_trail(record_id);
CREATE INDEX IF NOT EXISTS idx_audit_trail_changed_at ON public.audit_trail(changed_at);

-- ============================================================================
-- Functions & Triggers
-- ============================================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_classes_updated_at
    BEFORE UPDATE ON public.classes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_auth_users_updated_at
    BEFORE UPDATE ON auth.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Teacher role validation
CREATE OR REPLACE FUNCTION check_teacher_role()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = NEW.teacher_id 
        AND role IN ('teacher', 'admin')
    ) THEN
        RAISE EXCEPTION 'Only teachers and admins can create classes';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_teacher_role
    BEFORE INSERT OR UPDATE OF teacher_id ON public.classes
    FOR EACH ROW EXECUTE FUNCTION check_teacher_role();

-- Calculate distance from geofence center
CREATE OR REPLACE FUNCTION calculate_distance_from_center()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    session_center GEOGRAPHY(POINT);
BEGIN
    SELECT geofence_center INTO session_center
    FROM public.class_sessions
    WHERE id = NEW.session_id;
    
    IF NEW.scan_location IS NOT NULL AND session_center IS NOT NULL THEN
        NEW.distance_from_center := ST_Distance(session_center, NEW.scan_location);
    END IF;
    
    IF NEW.scan_location IS NULL AND NEW.location_data IS NOT NULL THEN
        NEW.scan_location := ST_SetSRID(
            ST_MakePoint(
                (NEW.location_data->>'lon')::FLOAT,
                (NEW.location_data->>'lat')::FLOAT
            ),
            4326
        )::GEOGRAPHY;
        
        NEW.distance_from_center := ST_Distance(session_center, NEW.scan_location);
    END IF;
    
    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_calculate_distance
    BEFORE INSERT ON public.attendance_logs
    FOR EACH ROW
    EXECUTE FUNCTION calculate_distance_from_center();

-- Audit trigger
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO public.audit_trail (table_name, record_id, operation, old_data)
        VALUES (TG_TABLE_NAME, OLD.id, TG_OP, row_to_json(OLD));
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO public.audit_trail (table_name, record_id, operation, old_data, new_data)
        VALUES (TG_TABLE_NAME, NEW.id, TG_OP, row_to_json(OLD), row_to_json(NEW));
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO public.audit_trail (table_name, record_id, operation, new_data)
        VALUES (TG_TABLE_NAME, NEW.id, TG_OP, row_to_json(NEW));
        RETURN NEW;
    END IF;
END;
$$;

CREATE TRIGGER audit_attendance_logs
    AFTER INSERT OR UPDATE OR DELETE ON public.attendance_logs
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_profiles
    AFTER UPDATE OR DELETE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Check geofence status
CREATE OR REPLACE FUNCTION check_geofence_status(
    scan_lat FLOAT, 
    scan_lon FLOAT, 
    target_session_id UUID
) 
RETURNS TABLE(is_inside BOOLEAN, distance_meters FLOAT) AS $$
DECLARE
    session_center GEOGRAPHY(POINT);
    session_radius INT;
    calc_distance FLOAT;
BEGIN
    SELECT geofence_center, geofence_radius_meters 
    INTO session_center, session_radius
    FROM public.class_sessions
    WHERE id = target_session_id;
    
    IF session_center IS NULL THEN
        RETURN QUERY SELECT false, NULL::FLOAT;
        RETURN;
    END IF;
    
    calc_distance := ST_Distance(
        session_center,
        ST_SetSRID(ST_MakePoint(scan_lon, scan_lat), 4326)::geography
    );
    
    RETURN QUERY SELECT (calc_distance <= session_radius), calc_distance;
END;
$$ LANGUAGE plpgsql;

-- Get active session
CREATE OR REPLACE FUNCTION get_active_session(p_class_id UUID)
RETURNS UUID AS $$
DECLARE
    session_id UUID;
BEGIN
    SELECT id INTO session_id
    FROM public.class_sessions
    WHERE class_id = p_class_id
    AND is_active = true
    AND start_time <= now()
    AND end_time >= now()
    ORDER BY start_time DESC
    LIMIT 1;
    
    RETURN session_id;
END;
$$ LANGUAGE plpgsql;

-- Check device registration
CREATE OR REPLACE FUNCTION is_device_registered(
    p_user_id UUID,
    p_device_id TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    device_exists BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM public.device_registry
        WHERE user_id = p_user_id AND device_id = p_device_id
    ) INTO device_exists;
    
    IF NOT device_exists THEN
        SELECT EXISTS(
            SELECT 1 FROM public.profiles
            WHERE id = p_user_id 
            AND device_ids @> jsonb_build_array(p_device_id)
        ) INTO device_exists;
    END IF;
    
    RETURN device_exists;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Seed Data (Optional - for development)
-- ============================================================================

-- Create default admin user
INSERT INTO auth.users (id, email, password_hash, email_confirmed_at, raw_user_meta_data)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'admin@nust.edu.pk',
    -- Password: admin123 (hashed with argon2)
    '$argon2id$v=19$m=65536,t=3,p=4$JMR4rxWCcC6ldE6pFWKMEQ$VZ7L9obgZ3RNjstqz4nwdgMO6IlTKFao1zOhbBjkwQA',
    now(),
    '{"cms_id": "ADMIN001", "role": "ADMIN"}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, cms_id, role, is_active)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'ADMIN001',
    'ADMIN',
    true
)
ON CONFLICT (id) DO NOTHING;
