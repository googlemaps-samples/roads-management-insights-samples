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
from fastapi import APIRouter, HTTPException
from typing import Dict
from server.utils.routes_sync_status import fetch_routes_sync_status, fetch_single_route_sync_status
from pydantic import BaseModel

# Setup logger
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("sync_api")

router = APIRouter()

class SyncStatusRouteConfig(BaseModel):
    db_project_id: int

class SyncStatusSingleRouteConfig(BaseModel):
    db_project_id: int
    uuid: str

@router.post("/get-routes-sync-status")
async def get_routes_sync_status(config: SyncStatusRouteConfig):
    """
    Get the sync status of all routes for a project.
    """
    try:
        result = fetch_routes_sync_status(config.db_project_id)
        return result
    except Exception as e:
        logger.error("Error getting routes sync status: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/get-single-route-sync-status")
async def get_single_route_sync_status(config: SyncStatusSingleRouteConfig):
    """
    Get the sync status of a single route for a project.
    """
    try:
        result = fetch_single_route_sync_status(config.db_project_id, config.uuid)
        return result
    except Exception as e:
        logger.error("Error getting single route sync status: %s", e)
        raise HTTPException(status_code=500, detail=str(e))