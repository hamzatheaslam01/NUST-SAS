from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from typing import Dict, Set
import json
import asyncio
from backend.database import supabase_admin

router = APIRouter()

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}
    
    async def connect(self, websocket: WebSocket, session_id: str):
        await websocket.accept()
        if session_id not in self.active_connections:
            self.active_connections[session_id] = set()
        self.active_connections[session_id].add(websocket)
    
    def disconnect(self, websocket: WebSocket, session_id: str):
        if session_id in self.active_connections:
            self.active_connections[session_id].discard(websocket)
            if not self.active_connections[session_id]:
                del self.active_connections[session_id]
    
    async def broadcast_to_session(self, session_id: str, message: dict):
        if session_id in self.active_connections:
            disconnected = set()
            for connection in self.active_connections[session_id]:
                try:
                    await connection.send_json(message)
                except:
                    disconnected.add(connection)
            
            for connection in disconnected:
                self.active_connections[session_id].discard(connection)

manager = ConnectionManager()

@router.websocket("/ws/session/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await manager.connect(websocket, session_id)
    try:
        while True:
            data = await websocket.receive_text()
            
            try:
                message = json.loads(data)
                if message.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})
    
    except WebSocketDisconnect:
        manager.disconnect(websocket, session_id)

async def broadcast_attendance_update(session_id: str, student_id: str, status: str, details: dict = None, student_cms_id: str = None):
    try:
        if not student_cms_id:
            # Try to fetch if not provided (requires DB access, which is hard here without session)
            # For now, default to Unknown if not provided
            student_cms_id = "Unknown"
        
        message = {
            "type": "attendance_update",
            "session_id": session_id,
            "student_id": student_id,
            "student_cms_id": student_cms_id,
            "status": status,
            "timestamp": details.get("timestamp") if details else None,
            "details": details
        }
        
        await manager.broadcast_to_session(session_id, message)
    except Exception as e:
        print(f"Error broadcasting attendance update: {str(e)}")
