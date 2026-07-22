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


import logging
from fastapi import APIRouter
from pydantic import BaseModel
from server.utils.get_routes_status import RouteUpdater
from server.utils.check_routes_status import RouteStatusChecker

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

logger = logging.getLogger("routes_status")
router = APIRouter()

# Lazy import to avoid circular dependency
def get_ws_manager():
    try:
        from server.main import ws_manager
        return ws_manager
    except (ImportError, AttributeError):
        return None

# ---- Data model for request body ----
class RoutesStatusConfig(BaseModel):
    project_number: str

@router.post("/get-routes-status")
async def get_routes_status(config: RoutesStatusConfig):
    logger.info("Getting routes status")
    updater = RouteUpdater(project_number=config.project_number)
    updater.run()
    return {"message": "Routes status got"}

@router.post("/check-routes-status")
async def check_routes_status(config: RoutesStatusConfig):
    logger.info("Checking routes status")
    checker = RouteStatusChecker(project_number=config.project_number)
    await checker.run()
    return {"message": "Routes status checked"}

@router.get("/websocket-connections")
async def get_websocket_connections():
    """Debug endpoint to check WebSocket connections."""
    ws_manager = get_ws_manager()
    if not ws_manager:
        return {"error": "WebSocket manager not available"}
    
    return {
        "total_connections": len(ws_manager.active_connections),
        "projects": {
            project_id: len(connections) 
            for project_id, connections in ws_manager.project_connections.items()
        },
        "all_project_ids": list(ws_manager.project_connections.keys())
    }