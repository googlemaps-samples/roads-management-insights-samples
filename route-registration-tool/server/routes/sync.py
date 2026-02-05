import logging
from fastapi import APIRouter, HTTPException
from server.db.database import query_db
from typing import Dict
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Any
from server.utils.sync_routes import execute_sync
from server.utils.sync_single_route import sync_single_route_to_bigquery

# Setup logger
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("sync_api")

router = APIRouter()

class SyncToBigQueryRequest(BaseModel):
    db_project_id: int
    project_number: str
    gcp_project_id: str
    dataset_name: str  # Required: BigQuery dataset name
    tag: Optional[str] = None  # Optional: If provided, only syncs specific tag (no BQ/Fetch)
    uuid: Optional[str] = None  # Optional: If provided, only syncs a single route

class SyncToBigQueryResponse(BaseModel):
    status: str
    message: str
    time_taken_seconds: float
    details: Dict[str, Any]

class SyncSingleRouteConfig(BaseModel):
    db_project_id: int
    project_number: str
    uuid: str


TABLES = ["roads", "routes", "polygons"]

@router.post("/sync")
async def sync_deleted_records() -> Dict:
    """
    Permanently delete all records where deleted_at is set
    for roads, routes, polygons, and regions.
    """
    logger.info("POST /sync called")
    deleted_counts = {}

    for table in TABLES:
        rows_before = await query_db(
            f"SELECT COUNT(*) as count FROM {table} WHERE deleted_at IS NOT NULL",
            one=True
        )
        count_before = rows_before["count"] if rows_before else 0
        await query_db(f"DELETE FROM {table} WHERE deleted_at IS NOT NULL", commit=True)
        deleted_counts[table] = count_before
        logger.info("Deleted %d rows from %s", count_before, table)

    response = {"status": "success", "deleted_rows": deleted_counts}
    logger.info("Sync response: %s", response)
    return response


@router.post("/sync-to-bigquery", response_model=SyncToBigQueryResponse)
async def sync_to_bigquery(config: SyncToBigQueryRequest):
    """
    Unified Endpoint for Route Synchronization.
    - Syncs deletions (DB -> API)
    - Syncs creations (DB -> API)
    - If tag is NOT provided: 
      - Fetches all routes (API -> DB)
      - Enriches data (BigQuery -> DB)
    """
    logger.info(f"Received Sync Request for Project: {config.project_number} (DB: {config.db_project_id})")
    start_time = datetime.now()

    try:
        # Call the logic function
        stats = await execute_sync(
            db_project_id=config.db_project_id,
            project_number=config.project_number,
            gcp_project_id=config.gcp_project_id,
            dataset_name=config.dataset_name,
            tag=config.tag,
            uuid=config.uuid
        )

        elapsed = round((datetime.now() - start_time).total_seconds(), 2)
        logger.info(f"Sync Completed in {elapsed}s. Stats: {stats}")

        return SyncToBigQueryResponse(
            status="success",
            message="Synchronization process completed.",
            time_taken_seconds=elapsed,
            details=stats
        )

    except HTTPException as he:
        # Re-raise HTTP exceptions from logic layer (e.g. API failures)
        logger.error(f"HTTP Exception in Unified Sync: {he.detail}")
        raise he
    except Exception as e:
        # Catch unexpected generic errors
        logger.exception("Critical unexpected error in unified sync endpoint")
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")
