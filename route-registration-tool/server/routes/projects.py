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


# server/routes/projects.py
import logging
import json
import uuid
import re
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from server.db.common import query_db
from server.utils.viewstate_calculator import calculate_viewstate
from server.utils.feature_flags import ENABLE_MULTITENANT
import server.db.common as projects_repo
from server.db.common import ProjectRepoDomainError

# Setup logger
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("projects_api")

router = APIRouter(prefix="/projects", tags=["Projects"])

# --------------------------
# Pydantic Models
# --------------------------

class ProjectCreate(BaseModel):
    """Model for creating a new project"""
    session_id: Optional[str] = Field(
        None, description="Owning session ID (UUID). If omitted, project is unscoped."
    )
    project_name: str = Field(..., description="Name of the project")
    jurisdiction_boundary_geojson: str = Field(..., description="GeoJSON boundary as string")
    google_cloud_project_id: Optional[str] = Field(None, description="Google Cloud Project ID")
    google_cloud_project_number: Optional[str] = Field(None, description="Google Cloud Project Number")
    subscription_id: Optional[str] = Field(None, description="Subscription ID")
    dataset_name: Optional[str] = Field(None, description="BigQuery dataset name")

class ProjectUpdate(BaseModel):
    """Model for updating a project"""
    project_name: Optional[str] = Field(None, description="Name of the project")
    jurisdiction_boundary_geojson: Optional[str] = Field(None, description="GeoJSON boundary as string")
    google_cloud_project_id: Optional[str] = Field(None, description="Google Cloud Project ID")
    google_cloud_project_number: Optional[str] = Field(None, description="Google Cloud Project Number")
    subscription_id: Optional[str] = Field(None, description="Subscription ID")
    dataset_name: Optional[str] = Field(None, description="BigQuery dataset name")
    map_snapshot: Optional[str] = Field(None, description="Base64-encoded map snapshot image")

class ProjectOut(BaseModel):
    """Model for project responses"""
    id: int
    project_uuid: Optional[str] = None
    session_id: Optional[str] = None
    project_name: str
    jurisdiction_boundary_geojson: str
    google_cloud_project_id: Optional[str] = None
    google_cloud_project_number: Optional[str] = None
    subscription_id: Optional[str] = None
    dataset_name: Optional[str] = None
    viewstate: Optional[str] = None
    map_snapshot: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    deleted_at: Optional[str] = None
    route_count: Optional[int] = 0
# Frontend compatibility models
class ProjectFormatAndCreate(BaseModel):
    """Model for the special format-and-create endpoint (frontend compatibility)"""
    region_name: Optional[str] = Field(None, description="Region name (maps to project_name)")
    project_name: Optional[str] = Field(None, description="Project name")
    geojson: Optional[str] = Field(None, description="GeoJSON (maps to jurisdiction_boundary_geojson)")
    google_cloud_project_id: Optional[str] = Field(None, description="Google Cloud Project ID")
    google_cloud_project_number: Optional[str] = Field(None, description="Google Cloud Project Number")
    subscription_id: Optional[str] = Field(None, description="Subscription ID")
    dataset_name: Optional[str] = Field(None, description="BigQuery dataset name")

class FormatAndCreateRequest(BaseModel):
    """Request body for format-and-create endpoint"""
    data: List[ProjectFormatAndCreate]

class FormatAndCreateResponse(BaseModel):
    """Response for format-and-create endpoint"""
    inserted_ids: List[int]

class RoutesSummary(BaseModel):
    """Model for routes summary response"""
    total: int = 0
    deleted: int = 0
    added: int = 0


class ProjectsListPagination(BaseModel):
    page: int
    limit: int
    total: int
    has_more: bool


class ProjectsListResponse(BaseModel):
    projects: List[ProjectOut]
    pagination: ProjectsListPagination
    route_summaries: Dict[str, RoutesSummary]

# --------------------------
# Helper Functions
# --------------------------

def validate_json_string(json_str: str, field_name: str) -> dict:
    """Validate and parse JSON string"""
    try:
        return json.loads(json_str)
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid JSON in {field_name}: {str(e)}"
        )

def row_to_project_out(row) -> ProjectOut:
    """Convert database row to ProjectOut model"""
    # Handle both mapping-style and tuple-style rows.
    def _get(key: str, idx: int):
        try:
            return row[key]
        except Exception:
            mapping = getattr(row, "_mapping", None)
            if mapping is not None:
                try:
                    return mapping[key]
                except Exception:
                    pass
            return row[idx]

    def _to_optional_string(v: Any) -> str | None:
        # DB drivers often return real datetime objects for DATETIME/TIMESTAMP columns.
        # `ProjectOut` expects strings, so normalize here.
        if v is None:
            return None
        if isinstance(v, datetime):
            return v.isoformat()
        return str(v)

    try:
        dataset_name = _get("dataset_name", 7)
        # Use default if None or empty string
        if not dataset_name:
            dataset_name = "historical_roads_data"
    except (KeyError, IndexError):
        dataset_name = "historical_roads_data"

    session_id_val: str | None
    try:
        session_id_val = _get("session_id", 13)
        if session_id_val is not None:
            session_id_val = str(session_id_val)
    except Exception:
        session_id_val = None
    
    return ProjectOut(
        id=_get("id", 0),
        project_uuid=_get("project_uuid", 1),
        session_id=session_id_val,
        project_name=_get("project_name", 2),
        jurisdiction_boundary_geojson=_get("jurisdiction_boundary_geojson", 3),
        google_cloud_project_id=_get("google_cloud_project_id", 4),
        google_cloud_project_number=_get("google_cloud_project_number", 5),
        subscription_id=_get("subscription_id", 6),
        dataset_name=dataset_name,
        viewstate=_get("viewstate", 8),
        map_snapshot=_get("map_snapshot", 9),
        created_at=_to_optional_string(_get("created_at", 10)),
        updated_at=_to_optional_string(_get("updated_at", 11)),
        deleted_at=_get("deleted_at", 12)
    )


def _validate_session_id(session_id: str) -> str:
    try:
        import uuid as _uuid

        return str(_uuid.UUID(str(session_id)))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session_id (expected UUID).")


async def _get_accessible_session_ids(session_id: str) -> list[str]:
    """Return [session_id] + directly linked sessions (non-transitive)."""
    sid = _validate_session_id(session_id)
    rows = await query_db(
        """
        SELECT linked_session_id
        FROM session_links
        WHERE session_id = ?
        """,
        (sid,),
    )
    linked: list[str] = []
    for r in rows:
        try:
            linked.append(r["linked_session_id"])
        except Exception:
            mapping = getattr(r, "_mapping", None)
            if mapping is not None and "linked_session_id" in mapping:
                linked.append(mapping["linked_session_id"])
    out = [sid] + [s for s in linked if s]
    seen: set[str] = set()
    uniq: list[str] = []
    for s in out:
        if s not in seen:
            seen.add(s)
            uniq.append(s)
    return uniq

def sanitize_error_for_5xx(e: Exception) -> str:
    s = str(e)
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"://([^:]+):([^@]+)@", r"://\1:***@", s)
    if len(s) > 400:
        s = s[:397] + "..."
    return s

# --------------------------
# API Endpoints
# --------------------------

@router.get("/list", response_model=List[ProjectOut])
async def get_all_projects():
    """Get all non-deleted projects"""
    try:
        logger.info("Fetching all projects")
        
        rows = await projects_repo.list_project_rows()
        
        projects = [row_to_project_out(row) for row in rows]
        logger.info(f"Found {len(projects)} projects")
        return projects
        
    except Exception as e:
        print("errrrrr", e)
        logger.error(f"Error fetching projects: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch projects")


@router.get("/list-paginated", response_model=ProjectsListResponse)
async def get_projects_paginated(
    page: int = Query(1, ge=1),
    limit: int = Query(24, ge=1, le=100),
    search: Optional[str] = Query(None),
    session_id: Optional[str] = Query(None, description="Session ID (UUID) to scope projects."),
):
    """Get paginated non-deleted projects."""
    try:
        session_ids = None
        if session_id:
            session_ids = await _get_accessible_session_ids(session_id)
        rows, total = await projects_repo.list_project_rows_paginated(
            page=page, limit=limit, search=search, session_ids=session_ids
        )
        projects = [row_to_project_out(row) for row in rows]
        project_ids = [p.id for p in projects]
        summaries = await projects_repo.get_routes_summaries_by_project_ids(project_ids)
        return ProjectsListResponse(
            projects=projects,
            pagination=ProjectsListPagination(
                page=page,
                limit=limit,
                total=total,
                has_more=(page * limit) < total,
            ),
            route_summaries={str(pid): RoutesSummary(**vals) for pid, vals in summaries.items()},
        )
    except Exception as e:
        logger.exception("Error fetching paginated projects")
        raise HTTPException(status_code=500, detail="Failed to fetch projects")

@router.get("/{project_id}/routes-summary", response_model=RoutesSummary)
async def get_project_routes_summary(project_id: int):
    """Get the summary of routes for a project"""
    try:
        logger.info(f"Fetching routes summary for project with ID: {project_id}")
        project_id = int(project_id)
        params = {"project_id": project_id}
        query = """
        SELECT 'total' AS type, COUNT(*) AS count
        FROM routes
        WHERE project_id = :project_id
        AND deleted_at IS NULL
        AND COALESCE(has_children, FALSE) = FALSE
        UNION ALL
        SELECT 'deleted' AS type, COUNT(*) AS count
        FROM routes
        WHERE project_id = :project_id
        AND deleted_at IS NOT NULL
        AND COALESCE(is_segmented, FALSE) = FALSE
        AND sync_status IN ('synced', 'validating', 'invalid')
        UNION ALL
        SELECT 'added' AS type, COUNT(*) AS count
        FROM routes
        WHERE project_id = :project_id
        AND deleted_at IS NULL
        AND sync_status = 'unsynced'
        AND COALESCE(is_enabled, FALSE) = TRUE
        AND COALESCE(has_children, FALSE) = FALSE
        """
        rows = await query_db(query, params)
        
        # Convert rows to summary dict
        summary = {"total": 0, "deleted": 0, "added": 0}
        for row in rows:
            row_type = row["type"]
            if row_type in summary:
                summary[row_type] = row["count"]
        
        return RoutesSummary(**summary)
    except Exception as e:
        logger.exception("Error fetching routes summary for project %s", project_id)
        logger.error(f"Error fetching routes summary for project {project_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch routes summary")


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project_by_id(project_id: int):
    """Get a specific project by ID"""
    try:
        logger.info(f"Fetching project with ID: {project_id}")
        
        row = await projects_repo.get_project_row(project_id)
        
        if not row:
            raise HTTPException(status_code=404, detail="Project not found")
        
        project = row_to_project_out(row)
        logger.info(f"Found project: {project.project_name}")
        
        return project
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching project {project_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch project")

@router.post("/", response_model=ProjectOut)
async def create_project(project_data: ProjectCreate):
    """Create a new project"""
    try:
        logger.info(f"Creating project: {project_data.project_name}")
        
        # Validate JSON fields
        validate_json_string(project_data.jurisdiction_boundary_geojson, "jurisdiction_boundary_geojson")
        
        # Calculate viewstate from GeoJSON boundary
        try:
            viewstate = calculate_viewstate(project_data.jurisdiction_boundary_geojson)
            viewstate_json = json.dumps(viewstate)
        except Exception as e:
            logger.warning(f"Failed to calculate viewstate: {str(e)}, continuing without viewstate")
            viewstate_json = None

        project_uuid_val = str(uuid.uuid4())
        row = await projects_repo.create_project(
            project_name=project_data.project_name,
            jurisdiction_boundary_geojson=project_data.jurisdiction_boundary_geojson,
            google_cloud_project_id=project_data.google_cloud_project_id,
            google_cloud_project_number=project_data.google_cloud_project_number,
            subscription_id=project_data.subscription_id,
            dataset_name=project_data.dataset_name,
            enable_multitenant=ENABLE_MULTITENANT,
            project_uuid=project_uuid_val,
            viewstate_json=viewstate_json,
            session_id=_validate_session_id(project_data.session_id)
            if project_data.session_id
            else None,
        )

        created_project = row_to_project_out(row)
        logger.info(f"Created project with ID: {created_project.id}")
        return created_project
        
    except HTTPException:
        raise
    except ProjectRepoDomainError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
    except Exception as e:
        logger.exception("Error creating project")
        return JSONResponse(
            status_code=500,
            content={
                "detail": "Failed to create project",
                "error": sanitize_error_for_5xx(e),
            },
        )

@router.put("/{project_id}", response_model=ProjectOut)
async def update_project(project_id: int, project_data: ProjectUpdate):
    """Update an existing project"""
    try:
        logger.info(f"Updating project with ID: {project_id}")
        
        # Check if project exists
        existing_project = await get_project_by_id(project_id)
        
        # Validate JSON fields if provided
        if project_data.jurisdiction_boundary_geojson:
            validate_json_string(project_data.jurisdiction_boundary_geojson, "jurisdiction_boundary_geojson")
        
        # Check for duplicate project_name within the same session scope (if being updated)
        if project_data.project_name is not None:
            if existing_project.session_id is not None:
                existing_name_query = """
                SELECT id FROM projects
                WHERE project_name = ? AND id != ? AND deleted_at IS NULL
                AND session_id = ?
                """
                existing_name = await query_db(
                    existing_name_query,
                    (project_data.project_name, project_id, existing_project.session_id),
                    one=True,
                )
            else:
                existing_name_query = """
                SELECT id FROM projects
                WHERE project_name = ? AND id != ? AND deleted_at IS NULL
                AND session_id IS NULL
                """
                existing_name = await query_db(
                    existing_name_query,
                    (project_data.project_name, project_id),
                    one=True,
                )
            if existing_name:
                raise HTTPException(
                    status_code=400,
                    detail=f"A project with the name '{project_data.project_name}' already exists. Please choose a different name."
                )

        # Single-tenant: one GCP project per app project
        if not ENABLE_MULTITENANT and project_data.google_cloud_project_id is not None:
            existing_gcp_query = """
            SELECT id, project_name FROM projects
            WHERE google_cloud_project_id = ? AND id != ? AND deleted_at IS NULL
            """
            existing_gcp = await query_db(
                existing_gcp_query,
                (project_data.google_cloud_project_id, project_id),
                one=True,
            )
            if existing_gcp:
                raise HTTPException(
                    status_code=400,
                    detail=f"A project with Google Cloud Project ID '{project_data.google_cloud_project_id}' already exists (Project: '{existing_gcp['project_name']}'). Each GCP project can only be used once."
                )
        
        # Calculate viewstate if GeoJSON is being updated
        viewstate_json = None
        if project_data.jurisdiction_boundary_geojson is not None:
            try:
                viewstate = calculate_viewstate(project_data.jurisdiction_boundary_geojson)
                viewstate_json = json.dumps(viewstate)
            except Exception as e:
                logger.warning(f"Failed to calculate viewstate: {str(e)}, continuing without viewstate")
        
        # Build dynamic update query
        update_fields = []
        update_values = []
        
        if project_data.project_name is not None:
            update_fields.append("project_name = ?")
            update_values.append(project_data.project_name)
        
        if project_data.jurisdiction_boundary_geojson is not None:
            update_fields.append("jurisdiction_boundary_geojson = ?")
            update_values.append(project_data.jurisdiction_boundary_geojson)
        
        if project_data.google_cloud_project_id is not None:
            update_fields.append("google_cloud_project_id = ?")
            update_values.append(project_data.google_cloud_project_id)
        
        if project_data.google_cloud_project_number is not None:
            update_fields.append("google_cloud_project_number = ?")
            update_values.append(project_data.google_cloud_project_number)
        
        if project_data.subscription_id is not None:
            update_fields.append("subscription_id = ?")
            update_values.append(project_data.subscription_id)
        
        if project_data.dataset_name is not None:
            update_fields.append("dataset_name = ?")
            update_values.append(project_data.dataset_name)
        
        if viewstate_json is not None:
            update_fields.append("viewstate = ?")
            update_values.append(viewstate_json)
        
        if project_data.map_snapshot is not None:
            update_fields.append("map_snapshot = ?")
            update_values.append(project_data.map_snapshot)
        
        if not update_fields:
            return existing_project
        
        update_fields.append("updated_at = CURRENT_TIMESTAMP")
        update_values.append(project_id)
        
        query = f"""
        UPDATE projects 
        SET {', '.join(update_fields)}
        WHERE id = ? AND deleted_at IS NULL
        """
        
        await query_db(query, tuple(update_values), commit=True)
        
        # Fetch the updated project
        updated_project = await get_project_by_id(project_id)
        logger.info(f"Updated project with ID: {project_id}")
        
        return updated_project
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating project {project_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update project")

@router.delete("/{project_id}")
async def delete_project(project_id: int):
    """Soft delete a project"""
    try:
        logger.info(f"Deleting project with ID: {project_id}")
        
        del_project_query = """
        DELETE FROM projects WHERE id = ? AND deleted_at IS NULL
        """

        del_routes_query = """
        DELETE FROM routes WHERE project_id = ?
        """
        
        await query_db(del_project_query, (project_id,), commit=True)
        await query_db(del_routes_query, (project_id,), commit=True)
        
        logger.info(f"Deleted project and routes with ID: {project_id}")
        
        return {"message": "Project deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting project {project_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to delete project")

# --------------------------
# Frontend Compatibility Endpoints
# --------------------------

@router.post("/format-and-create", response_model=FormatAndCreateResponse)
async def format_and_create_projects(request: FormatAndCreateRequest):
    """Special endpoint for frontend compatibility - creates projects from formatted data"""
    try:
        logger.info(f"Format-and-create request with {len(request.data)} projects")
        
        inserted_ids = []
        
        for project_data in request.data:
            # Map frontend fields to backend fields
            project_name = project_data.project_name or project_data.region_name
            if not project_name:
                raise HTTPException(
                    status_code=400,
                    detail="Either project_name or region_name must be provided"
                )
            
            geojson = project_data.geojson or getattr(
                project_data, "jurisdiction_boundary_geojson", None
            )
            if not geojson:
                raise HTTPException(
                    status_code=400,
                    detail="GeoJSON boundary must be provided"
                )
            
            # Validate JSON fields
            validate_json_string(geojson, "geojson")
            
            # Calculate viewstate from GeoJSON boundary
            try:
                viewstate = calculate_viewstate(geojson)
                viewstate_json = json.dumps(viewstate)
            except Exception as e:
                logger.warning(f"Failed to calculate viewstate for project: {str(e)}, continuing without viewstate")
                viewstate_json = None

            project_uuid_val = str(uuid.uuid4())
            row = await projects_repo.create_project(
                project_name=project_name,
                jurisdiction_boundary_geojson=geojson,
                google_cloud_project_id=project_data.google_cloud_project_id,
                google_cloud_project_number=project_data.google_cloud_project_number,
                subscription_id=project_data.subscription_id,
                dataset_name=project_data.dataset_name,
                enable_multitenant=ENABLE_MULTITENANT,
                project_uuid=project_uuid_val,
                viewstate_json=viewstate_json,
            )

            project_id = row["id"] if isinstance(row, dict) else row[0]
            inserted_ids.append(project_id)
            logger.info(f"Created project with ID: {project_id}")
        
        logger.info(f"Format-and-create completed: {len(inserted_ids)} projects created")
        
        return FormatAndCreateResponse(inserted_ids=inserted_ids)
        
    except HTTPException:
        raise
    except ProjectRepoDomainError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
    except Exception as e:
        logger.exception("Error in format-and-create")
        return JSONResponse(
            status_code=500,
            content={
                "detail": "Failed to create projects",
                "error": sanitize_error_for_5xx(e),
            },
        )