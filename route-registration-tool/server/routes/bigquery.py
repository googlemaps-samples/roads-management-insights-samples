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


"""
BigQuery API endpoints
Provides endpoints for fetching BigQuery datasets
"""

import logging
import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from server.utils.auth import get_oauth_token

# Setup logger
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("bigquery_api")

router = APIRouter(prefix="/bigquery", tags=["BigQuery"])

# ===== Pydantic Models =====

class DatasetInfo(BaseModel):
    """BigQuery dataset information"""
    datasetId: str
    projectId: str
    location: Optional[str] = None
    friendlyName: Optional[str] = None

class DatasetsResponse(BaseModel):
    """Response model for datasets list"""
    datasets: List[DatasetInfo]

# ===== API Endpoints =====

@router.get("/datasets/{project_id}", response_model=DatasetsResponse)
async def get_datasets(project_id: str):
    """
    Get list of BigQuery datasets for a given GCP project.
    
    Args:
        project_id: Google Cloud Project ID
        
    Returns:
        List of dataset information including datasetId, projectId, location, and friendlyName
    """
    try:
        logger.info(f"Fetching datasets for project: {project_id}")
        
        # Get OAuth token
        access_token = await get_oauth_token()
        
        # Call BigQuery API
        url = f"https://bigquery.googleapis.com/bigquery/v2/projects/{project_id}/datasets"
        headers = {
            "Authorization": f"Bearer {access_token}",
        }
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            data = response.json()
        
        # Extract datasets from response
        datasets = []
        if "datasets" in data:
            for dataset in data["datasets"]:
                dataset_ref = dataset.get("datasetReference", {})
                datasets.append(
                    DatasetInfo(
                        datasetId=dataset_ref.get("datasetId", ""),
                        projectId=dataset_ref.get("projectId", project_id),
                        location=dataset.get("location"),
                        friendlyName=dataset.get("friendlyName"),
                    )
                )
        
        logger.info(f"Found {len(datasets)} datasets for project {project_id}")
        return DatasetsResponse(datasets=datasets)
        
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error fetching datasets: {e.response.status_code} - {e.response.text}")
        if e.response.status_code == 403:
            raise HTTPException(
                status_code=403,
                detail=f"Permission denied for project {project_id}. Please check your credentials."
            )
        elif e.response.status_code == 404:
            raise HTTPException(
                status_code=404,
                detail=f"Project {project_id} not found."
            )
        else:
            raise HTTPException(
                status_code=e.response.status_code,
                detail=f"Failed to fetch datasets: {e.response.text}"
            )
    except Exception as e:
        logger.error(f"Error fetching datasets for project {project_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )

