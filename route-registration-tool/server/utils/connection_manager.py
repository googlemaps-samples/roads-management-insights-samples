# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.


from fastapi import WebSocket
import json
import logging
from typing import Dict, Any

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []
        # Map project_id to list of WebSocket connections
        self.project_connections: Dict[str, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, project_id: str = None):
        # Note: websocket.accept() should be called in the endpoint, not here
        # This method only tracks the connection for broadcasting
        if websocket not in self.active_connections:
            self.active_connections.append(websocket)
        
        # Track connection by project_id if provided
        if project_id:
            project_id_str = str(project_id)  # Ensure it's a string
            if project_id_str not in self.project_connections:
                self.project_connections[project_id_str] = []
            if websocket not in self.project_connections[project_id_str]:
                self.project_connections[project_id_str].append(websocket)
                logger.info(f"[WEBSOCKET] Registered connection for project {project_id_str}. Total connections for this project: {len(self.project_connections[project_id_str])}")
            else:
                logger.debug(f"[WEBSOCKET] Connection already registered for project {project_id_str}")
        
        logger.info(f"[WEBSOCKET] Client connected. Total active connections: {len(self.active_connections)}")
        if self.project_connections:
            logger.info(f"[WEBSOCKET] Projects with registered connections: {list(self.project_connections.keys())} (counts: {[(k, len(v)) for k, v in self.project_connections.items()]})")
        else:
            logger.info(f"[WEBSOCKET] No projects have registered connections yet")

    def disconnect(self, websocket: WebSocket):
        try:
            self.active_connections.remove(websocket)
            
            # Remove from project_connections
            for project_id, connections in list(self.project_connections.items()):
                if websocket in connections:
                    connections.remove(websocket)
                    if not connections:
                        del self.project_connections[project_id]
        except ValueError:
            pass
        logger.info(f"Client disconnected. Total: {len(self.active_connections)}")

    async def broadcast_route_status_update(self, project_id: str, route_update: Dict[str, Any]):
        """Broadcast route status update to all clients connected to a specific project."""
        # Convert project_id to string to ensure matching
        project_id_str = str(project_id)
        
        if project_id_str not in self.project_connections:
            logger.debug(f"[WEBSOCKET] No connections found for project {project_id_str}. Available projects: {list(self.project_connections.keys())}")
            return
        
        message = json.dumps({
            "type": "route_status_update",
            "data": route_update
        })
        
        disconnected = []
        connections = self.project_connections[project_id_str]
        logger.info(f"[WEBSOCKET] Broadcasting to {len(connections)} connection(s) for project {project_id_str}")
        
        for websocket in connections:
            try:
                await websocket.send_text(message)
                logger.debug(f"[WEBSOCKET] Successfully sent route status update to client for route {route_update.get('route_id')}")
            except Exception as e:
                logger.warning(f"[WEBSOCKET] Failed to send route status update to client: {e}")
                disconnected.append(websocket)
        
        # Clean up disconnected clients
        for ws in disconnected:
            self.disconnect(ws)