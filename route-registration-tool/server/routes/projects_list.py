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
from server.utils.feature_flags import ENABLE_MULTITENANT
from server.db.database import query_db

router = APIRouter()
logger = logging.getLogger("get_projects_route")


@router.get("/gcp-projects-list")
async def get_projects_list():
    """Get accessible GCP projects. When single-tenant, excludes GCP IDs already used by a project."""
    projects = list_accessible_gcp_projects()
    if type(projects) == str:
        logger.error(f"Error: {projects}")
        raise HTTPException(status_code=403, detail=projects)

    if not ENABLE_MULTITENANT:
        # Single-tenant: only show GCP projects not already used
        existing_projects_query = """
        SELECT google_cloud_project_id
        FROM projects
        WHERE google_cloud_project_id IS NOT NULL
        AND deleted_at IS NULL
        """
        existing_rows = await query_db(existing_projects_query)
        used_project_ids = {row["google_cloud_project_id"] for row in existing_rows}
        projects = [p for p in projects if p.get("project_id") not in used_project_ids]
        logger.info(f"Found {len(projects)} available projects (single-tenant: excluding already used)")
    else:
        logger.info(f"Found {len(projects)} projects")

    return {"projects": projects}