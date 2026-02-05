import logging
from fastapi import APIRouter, HTTPException
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

# Store active validation checkers by project_number
active_checkers = {}

# ---- Data model for request body ----
class RoutesStatusConfig(BaseModel):
    project_number: str

class ValidationCheckerConfig(BaseModel):
    project_number: str
    interval_seconds: int = 20

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
    checker.run()
    return {"message": "Routes status checked"}

@router.post("/start-validation-checker")
async def start_validation_checker(config: ValidationCheckerConfig):
    """Start continuous validation status checking for routes with STATE_VALIDATING status."""
    project_number = config.project_number
    
    # Stop existing checker if running
    if project_number in active_checkers:
        logger.info(f"Stopping existing validation checker for project {project_number}")
        active_checkers[project_number].stop_validation_checker()
    
    # Create and start new checker
    logger.info(f"Starting validation checker for project {project_number} (interval: {config.interval_seconds}s)")
    checker = RouteStatusChecker(project_number=project_number)
    checker.start_validation_checker(interval_seconds=config.interval_seconds)
    active_checkers[project_number] = checker
    
    return {
        "message": f"Validation checker started for project {project_number}",
        "interval_seconds": config.interval_seconds
    }

@router.post("/stop-validation-checker")
async def stop_validation_checker(config: RoutesStatusConfig):
    """Stop continuous validation status checking for a project."""
    project_number = config.project_number
    
    if project_number not in active_checkers:
        raise HTTPException(
            status_code=404,
            detail=f"No active validation checker found for project {project_number}"
        )
    
    logger.info(f"Stopping validation checker for project {project_number}")
    active_checkers[project_number].stop_validation_checker()
    del active_checkers[project_number]
    
    return {"message": f"Validation checker stopped for project {project_number}"}

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