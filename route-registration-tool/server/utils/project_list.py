import os
import logging
from google.cloud.resourcemanager import ProjectsClient
from google.api_core.exceptions import PermissionDenied, ServiceUnavailable, GoogleAPICallError
from fastapi import HTTPException

# Silence noisy gRPC logs
os.environ["GRPC_VERBOSITY"] = "NONE"
os.environ["GRPC_CPP_MIN_LOG_LEVEL"] = "3"
logging.getLogger("google").setLevel(logging.ERROR)
logging.getLogger("grpc").setLevel(logging.CRITICAL)

# Set up logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

ch = logging.StreamHandler()
ch.setLevel(logging.INFO)
formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
ch.setFormatter(formatter)
logger.addHandler(ch)

def list_accessible_gcp_projects():
    """Lists all GCP projects accessible to the authenticated user."""
    try:
        client = ProjectsClient()
        projects = []

        for project in client.search_projects():
            project_number = project.name.split('/')[-1]
            logger.info(f"Project ID: {project.project_id}, Project Number: {project_number}")
            projects.append({
                "project_id": project.project_id,
                "project_number": project_number
            })

        logger.info(f"Total accessible projects: {len(projects)}")
        return projects

    except PermissionDenied as e:
        if "SERVICE_DISABLED" in str(e):
            logger.error(f"Service disabled error: {e.message}")
            raise HTTPException(status_code=403, detail=f"Service disabled: {e.message}")
        else:
            logger.error(f"Permission Denied: {e.message}")
            raise HTTPException(status_code=403, detail=f"Permission Denied: {e.message}")

    except ServiceUnavailable as e:
        logger.error("Service temporarily unavailable. Try again later.")
        raise HTTPException(status_code=503, detail="Service temporarily unavailable. Try again later.")

    except GoogleAPICallError as e:
        logger.exception(f"Unexpected API error: {e}")
        raise HTTPException(status_code=500, detail=f"Unexpected API error: {e}")

    except Exception as e:
        logger.exception(f"Unexpected error: {type(e).__name__} - {e}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {type(e).__name__} - {e}")