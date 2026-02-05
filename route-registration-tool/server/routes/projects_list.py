import logging
from fastapi import APIRouter, HTTPException
from server.utils.project_list import list_accessible_gcp_projects
from server.db.database import query_db

router = APIRouter()
logger = logging.getLogger("get_projects_route")

@router.get("/gcp-projects-list")
async def get_projects_list():
    """Get all available GCP projects (excluding ones already used in database)"""
    projects = list_accessible_gcp_projects()
    if type(projects) == str:
        logger.error(f"Error: {projects}")
        raise HTTPException(status_code=403, detail=projects)
    
    # Get list of GCP project IDs already used in the database
    existing_projects_query = """
    SELECT google_cloud_project_id 
    FROM projects 
    WHERE google_cloud_project_id IS NOT NULL 
    AND deleted_at IS NULL
    """
    existing_rows = await query_db(existing_projects_query)
    used_project_ids = {row["google_cloud_project_id"] for row in existing_rows}
    
    # Filter out projects that are already used
    available_projects = [
        project for project in projects 
        if project.get("project_id") not in used_project_ids
    ]
    
    logger.info(f"Found {len(projects)} total projects, {len(available_projects)} available (not yet used)")
    return {"projects": available_projects}