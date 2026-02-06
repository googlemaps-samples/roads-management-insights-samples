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


import requests
import logging
from .auth import get_oauth_token
from fastapi import HTTPException

# Set up logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

ch = logging.StreamHandler()
ch.setLevel(logging.INFO)
formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
ch.setFormatter(formatter)
logger.addHandler(ch)

async def verify_project_details(project_id: str):
    """
    Verify project details by calling Google Cloud Resource Manager API v3.
    
    Args:
        project_id: The GCP project ID to verify
        
    Returns:
        dict: Project details if successful, error message if project not found or error occurred
    """
    access_token = await get_oauth_token()
    url = f"https://cloudresourcemanager.googleapis.com/v3/projects/{project_id}"
    headers = {
        "Authorization": f"Bearer {access_token}",
    }

    response = requests.get(url, headers=headers)
    response_json = response.json()

    if response_json.get("error") is None:
        project_number = response_json.get("name").split("/")[-1]
        project_id = response_json.get("projectId")
        return {
            "project_number": project_number,
            "project_id": project_id
        }
    elif response_json.get("error").get("code") == 403:
        error_message = response_json.get("error").get("message", "Permission denied")
        logger.error(f"Permission denied for project {project_id}: {error_message}")
        raise HTTPException(status_code=403, detail=f"Permission denied for project {project_id}: {error_message}")        
    else:
        logger.error(f"Unexpected error while verifying project {project_id}: {response.text}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {response.text}")
    