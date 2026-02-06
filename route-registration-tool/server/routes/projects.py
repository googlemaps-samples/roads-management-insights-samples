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
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from server.db.database import query_db
from server.utils.viewstate_calculator import calculate_viewstate

# Setup logger
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("projects_api")

router = APIRouter(prefix="/projects", tags=["Projects"])

# --------------------------
# Pydantic Models
# --------------------------

class ProjectCreate(BaseModel):
    """Model for creating a new project"""
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
    # sqlite3.Row objects use bracket notation, not .get()
    # NULL values will be None in Python automatically
    # Handle dataset_name which might not exist in older databases
    try:
        dataset_name = row["dataset_name"]
        # Use default if None or empty string
        if not dataset_name:
            dataset_name = "historical_roads_data"
    except (KeyError, IndexError):
        dataset_name = "historical_roads_data"
    
    return ProjectOut(
        id=row["id"],
        project_name=row["project_name"],
        jurisdiction_boundary_geojson=row["jurisdiction_boundary_geojson"],
        google_cloud_project_id=row["google_cloud_project_id"],
        google_cloud_project_number=row["google_cloud_project_number"],
        subscription_id=row["subscription_id"],
        dataset_name=dataset_name,
        viewstate=row["viewstate"],
        map_snapshot=row["map_snapshot"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        deleted_at=row["deleted_at"]
    )

# --------------------------
# API Endpoints
# --------------------------

@router.get("/list", response_model=List[ProjectOut])
async def get_all_projects():
    """Get all non-deleted projects"""
    try:
        logger.info("Fetching all projects")
        
        projects_query = """
        SELECT id, project_name, jurisdiction_boundary_geojson,
               google_cloud_project_id, google_cloud_project_number, subscription_id,
               dataset_name, viewstate, map_snapshot, created_at, updated_at, deleted_at
        FROM projects 
        WHERE deleted_at IS NULL
        ORDER BY created_at DESC
        """
        
        rows = await query_db(projects_query)
        
        projects = [row_to_project_out(row) for row in rows]
        logger.info(f"Found {len(projects)} projects")
        return projects
        
    except Exception as e:
        logger.error(f"Error fetching projects: {str(e)}")
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
        AND has_children = 0
        UNION ALL
        SELECT 'deleted' AS type, COUNT(*) AS count
        FROM routes
        WHERE project_id = :project_id
        AND deleted_at IS NOT NULL
        AND is_segmented = 0
        AND sync_status IN ('synced', 'validating', 'invalid')
        UNION ALL
        SELECT 'added' AS type, COUNT(*) AS count
        FROM routes
        WHERE project_id = :project_id
        AND deleted_at IS NULL
        AND sync_status = 'unsynced'
        AND is_enabled = 1
        AND has_children = 0;
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
        logger.error(f"Error fetching routes summary for project {project_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch routes summary")


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project_by_id(project_id: int):
    """Get a specific project by ID"""
    try:
        logger.info(f"Fetching project with ID: {project_id}")
        
        query = """
        SELECT id, project_name, jurisdiction_boundary_geojson,
               google_cloud_project_id, google_cloud_project_number, subscription_id,
               dataset_name, viewstate, map_snapshot, created_at, updated_at, deleted_at
        FROM projects 
        WHERE id = ? AND deleted_at IS NULL
        """
        
        row = await query_db(query, (project_id,), one=True)
        
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
        
        # Check for duplicate project_name
        existing_name_query = """
        SELECT id FROM projects 
        WHERE project_name = ? AND deleted_at IS NULL
        """
        existing_name = await query_db(existing_name_query, (project_data.project_name,), one=True)
        if existing_name:
            raise HTTPException(
                status_code=400,
                detail=f"A project with the name '{project_data.project_name}' already exists. Please choose a different name."
            )
        
        # Check for duplicate google_cloud_project_id
        google_cloud_project_id = project_data.google_cloud_project_id
        google_cloud_project_number = project_data.google_cloud_project_number
        subscription_id = project_data.subscription_id
        dataset_name = project_data.dataset_name
        if google_cloud_project_id:
            existing_gcp_query = """
            SELECT id, project_name FROM projects 
            WHERE google_cloud_project_id = ? AND deleted_at IS NULL
            """
            existing_gcp = await query_db(existing_gcp_query, (google_cloud_project_id,), one=True)
            if existing_gcp:
                raise HTTPException(
                    status_code=400,
                    detail=f"A project with Google Cloud Project ID '{google_cloud_project_id}' already exists (Project: '{existing_gcp['project_name']}'). Each GCP project can only be used once."
                )
        
        # Calculate viewstate from GeoJSON boundary
        try:
            viewstate = calculate_viewstate(project_data.jurisdiction_boundary_geojson)
            viewstate_json = json.dumps(viewstate)
        except Exception as e:
            logger.warning(f"Failed to calculate viewstate: {str(e)}, continuing without viewstate")
            viewstate_json = None
        
        query = """
        INSERT INTO projects (project_name, jurisdiction_boundary_geojson, viewstate, google_cloud_project_id, google_cloud_project_number, subscription_id, dataset_name)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """
        
        project_id = await query_db(
            query,
            (
                project_data.project_name,
                project_data.jurisdiction_boundary_geojson,
                viewstate_json,
                google_cloud_project_id,
                google_cloud_project_number,
                subscription_id,
                dataset_name
            ),
            commit=True
        )
        
        # Fetch the created project
        created_project = await get_project_by_id(project_id)
        logger.info(f"Created project with ID: {project_id}")
        
        return created_project
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating project: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create project")

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
        
        # Check for duplicate project_name (if being updated)
        if project_data.project_name is not None:
            existing_name_query = """
            SELECT id FROM projects 
            WHERE project_name = ? AND id != ? AND deleted_at IS NULL
            """
            existing_name = await query_db(existing_name_query, (project_data.project_name, project_id), one=True)
            if existing_name:
                raise HTTPException(
                    status_code=400,
                    detail=f"A project with the name '{project_data.project_name}' already exists. Please choose a different name."
                )
        
        # Check for duplicate google_cloud_project_id (if being updated)
        if project_data.google_cloud_project_id is not None:
            existing_gcp_query = """
            SELECT id, project_name FROM projects 
            WHERE google_cloud_project_id = ? AND id != ? AND deleted_at IS NULL
            """
            existing_gcp = await query_db(existing_gcp_query, (project_data.google_cloud_project_id, project_id), one=True)
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
            
            geojson = project_data.geojson or project_data.jurisdiction_boundary_geojson
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
            
            query = """
            INSERT INTO projects (project_name, jurisdiction_boundary_geojson, viewstate, google_cloud_project_id, google_cloud_project_number, subscription_id, dataset_name)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """
            
            project_id = await query_db(
                query,
                (
                    project_name,
                    geojson,
                    viewstate_json,
                    project_data.google_cloud_project_id,
                    project_data.google_cloud_project_number,
                    project_data.subscription_id,
                    project_data.dataset_name
                ),
                commit=True
            )
            
            inserted_ids.append(project_id)
            logger.info(f"Created project with ID: {project_id}")
        
        logger.info(f"Format-and-create completed: {len(inserted_ids)} projects created")
        
        return FormatAndCreateResponse(inserted_ids=inserted_ids)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in format-and-create: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create projects")