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