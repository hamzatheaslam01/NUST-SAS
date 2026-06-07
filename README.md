# NUST Secure Attendance System (NUST-SAS)
A multi-factor attendance verification platform that prevents proxy attendance through biometrics, geolocation, device fingerprinting, and cryptographic assertions.

## Architecture

- **Backend**: FastAPI + Uvicorn serving REST endpoints and enforcing security policies
- **Database**: Supabase (PostgreSQL + PostGIS) for spatial validation and audit logging
- **Mobile App**: Flutter student client with biometric liveness, geofencing, and QR flows
- **Web Dashboard**: React + Vite dashboard for instructors and admins
- **Cache**: Redis-backed nonce store that protects against replay attacks

## Repository Layout

- `backend/` – FastAPI project with routers, schemas, services, and dependency wiring
- `nust-sas-mobile/` – Flutter project for students and faculty (Android/iOS/web)
- `nust-sas-web/` – Vite + React dashboard for administrators and instructors
- `migrations/` – PostgreSQL schema for Supabase, including PostGIS setup
- `reference-docs/` – Project writeups and reports


