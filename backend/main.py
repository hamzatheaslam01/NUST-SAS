from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import instructor, auth, attendance, classes, websocket, admin

app = FastAPI(title="NUST-SAS Verification Engine")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(instructor.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(attendance.router, prefix="/api")
app.include_router(classes.router, prefix="/api")
app.include_router(websocket.router, prefix="/api")
app.include_router(admin.router, prefix="/api")

@app.get("/")
def read_root():
    return {"message": "NUST-SAS API is running"}
