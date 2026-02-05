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