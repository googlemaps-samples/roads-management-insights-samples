"""
Cloud Firestore logging utility for route metrics.

This module provides:
- Firestore client initialization using Application Default Credentials
- Reusable function to log route creation events to Cloud Firestore
- Error handling that fails silently to not break API responses
- Non-blocking async logging using background tasks

Environment Variables:
- GOOGLE_CLOUD_PROJECT: GCP project ID (required)
- FIRESTORE_DATABASE_ID: Database ID to use (default: "(default)")
- FIREBASE_CREATED_BY: Creator identifier for logging (optional)
- ENABLE_FIRESTORE_LOGGING: Enable/disable Firestore logging (default: "true")
  - Set to "false", "0", "no", or "off" to disable logging
  - Set to "true", "1", "yes", or "on" to enable logging
"""
import logging
import os
import asyncio
from typing import Dict, Any, Optional
from google.cloud import firestore
from google.auth import default
from google.auth.exceptions import DefaultCredentialsError
from google.api_core import exceptions as gcp_exceptions

logger = logging.getLogger(__name__)

# Global Firestore client instance
_firestore_client: Optional[firestore.Client] = None
_database_missing_warned = False  # Track if we've warned about missing database

def is_logging_enabled() -> bool:
    """
    Check if Firestore logging is enabled via environment variable.
    
    Returns:
        True if logging is enabled, False otherwise
    """
    enabled = os.getenv("ENABLE_FIRESTORE_LOGGING", "true").lower().strip()
    return enabled in ("true", "1", "yes", "on")

def initialize_firebase() -> bool:
    """
    Initialize Cloud Firestore client using Application Default Credentials.
    
    This should be called once at application startup.
    Returns True if initialization succeeded, False otherwise.
    """
    global _firestore_client
    
    if _firestore_client is not None:
        logger.info("Firestore client already initialized")
        return True
    
    try:
        # Use Application Default Credentials (ADC)
        # This will work with:
        # - Service account key file (GOOGLE_APPLICATION_CREDENTIALS env var)
        # - GCP Compute Engine/Cloud Run service accounts
        # - gcloud auth application-default login (for local development)
        
        # Get project ID from environment or credentials
        project_id = os.getenv("GOOGLE_CLOUD_PROJECT")
        if not project_id:
            try:
                credentials, project = default()
                project_id = project
            except DefaultCredentialsError:
                logger.warning("Could not determine project ID from credentials")
                project_id = None
        
        if not project_id:
            logger.error("Project ID not found. Set GOOGLE_CLOUD_PROJECT environment variable.")
            return False
        
        # Initialize Firestore client
        # Check if a custom database name is specified via environment variable
        # Default is "(default)", but user may have a custom database name
        database_id = os.getenv("FIRESTORE_DATABASE_ID", "(default)")
        
        try:
            # Check if logging is enabled
            if not is_logging_enabled():
                logger.info("Firestore logging is disabled via ENABLE_FIRESTORE_LOGGING environment variable")
                return False
            
            # Try to use the specified database
            if database_id == "(default)":
                _firestore_client = firestore.Client(project=project_id)
            else:
                # Use custom database ID
                _firestore_client = firestore.Client(project=project_id, database=database_id)
            
            logger.info(f"Cloud Firestore client initialized for project: {project_id}, database: {database_id}")
            logger.info("Using existing Firestore database. Write operations will be attempted on route creation.")
            return True
        except Exception as e:
            logger.error(f"Failed to create Firestore client: {e}")
            _firestore_client = None
            return False
        
    except Exception as e:
        logger.error(f"Failed to initialize Cloud Firestore client: {e}")
        logger.warning("Route metrics logging will be disabled")
        _firestore_client = None
        return False

def get_created_by() -> str:
    """
    Get the creator identifier for route logging.
    
    Priority:
    1. FIREBASE_CREATED_BY environment variable
    2. GOOGLE_CLOUD_PROJECT environment variable (project ID)
    3. Default: "route-registration-tool-service"
    
    Returns:
        String identifier for the creator
    """
    created_by = os.getenv("FIREBASE_CREATED_BY")
    if created_by:
        return created_by
    
    project_id = os.getenv("GOOGLE_CLOUD_PROJECT")
    if project_id:
        return f"service-{project_id}"
    
    return "route-registration-tool-service"

async def log_route_creation_async(
    route_id: str,
    route_metadata: Optional[Dict[str, Any]] = None,
    created_by: Optional[str] = None,
    is_update: bool = False
) -> None:
    """
    Async wrapper for log_route_creation that runs in background.
    This function is non-blocking and designed to be used with FastAPI BackgroundTasks.
    """
    # Check if logging is enabled before proceeding
    if not is_logging_enabled():
        logger.debug("Firestore logging is disabled, skipping route logging")
        return
    
    # Run the synchronous logging function in a thread pool to avoid blocking
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, log_route_creation, route_id, route_metadata, created_by, is_update)

def log_route_creation(
    route_id: str,
    route_metadata: Optional[Dict[str, Any]] = None,
    created_by: Optional[str] = None,
    is_update: bool = False
) -> bool:
    """
    Log a route creation or update event to Cloud Firestore.
    
    This function fails silently - errors are logged but do not raise exceptions.
    This ensures that logging failures don't break API responses.
    
    Args:
        route_id: The UUID of the route that was created or updated
        route_metadata: Optional dictionary containing route metadata such as:
            - distance (float): Route distance in km
            - jurisdiction (str): Jurisdiction name
            - project_id (int): Project ID
            - route_name (str): Route name
            - route_type (str): Route type (e.g., "drawn", "individual", "polygon_import")
            - tag (str): Route tag
            - length (float): Route length
            - Any other relevant fields
        created_by: Optional creator identifier. If not provided, uses get_created_by()
        is_update: If True, this is an update operation (adds updatedAt timestamp)
    
    Returns:
        True if logging succeeded, False otherwise
    """
    global _firestore_client, _database_missing_warned
    
    # Check if logging is enabled
    if not is_logging_enabled():
        logger.debug("Firestore logging is disabled, skipping route logging")
        return False
    
    # Check if Firestore is initialized
    if _firestore_client is None:
        logger.debug("Firestore client not initialized, skipping route logging")
        return False
    
    try:
        # Get reference to the "route-metrics" collection
        collection_ref = _firestore_client.collection("route-metrics")
        
        # Prepare document data
        doc_ref = collection_ref.document(route_id)
        
        # Check if document exists to preserve createdAt timestamp
        existing_doc = doc_ref.get()
        
        doc_data: Dict[str, Any] = {
            "routeId": route_id,
            "createdBy": created_by or get_created_by(),
        }
        
        # Set timestamp based on operation type
        if is_update:
            doc_data["updatedAt"] = firestore.SERVER_TIMESTAMP
            # Preserve original createdAt if document exists
            if existing_doc.exists:
                existing_data = existing_doc.to_dict()
                if "createdAt" in existing_data:
                    doc_data["createdAt"] = existing_data["createdAt"]
                elif "timestamp" in existing_data:
                    doc_data["createdAt"] = existing_data["timestamp"]
            else:
                # Document doesn't exist yet, set createdAt
                doc_data["createdAt"] = firestore.SERVER_TIMESTAMP
        else:
            # New creation
            doc_data["createdAt"] = firestore.SERVER_TIMESTAMP
            doc_data["timestamp"] = firestore.SERVER_TIMESTAMP  # Keep for backward compatibility
        
        # Add route metadata if provided
        if route_metadata:
            # Extract common metadata fields
            if "distance" in route_metadata and route_metadata["distance"] is not None:
                doc_data["distance"] = float(route_metadata["distance"])
            if "length" in route_metadata and route_metadata["length"] is not None:
                doc_data["length"] = float(route_metadata["length"])
            if "jurisdiction" in route_metadata and route_metadata["jurisdiction"]:
                doc_data["jurisdiction"] = str(route_metadata["jurisdiction"])
            if "project_id" in route_metadata and route_metadata["project_id"] is not None:
                doc_data["projectId"] = int(route_metadata["project_id"])
            if "route_name" in route_metadata and route_metadata["route_name"]:
                doc_data["routeName"] = str(route_metadata["route_name"])
            if "route_type" in route_metadata and route_metadata["route_type"]:
                doc_data["routeType"] = str(route_metadata["route_type"])
            if "tag" in route_metadata and route_metadata["tag"]:
                doc_data["tag"] = str(route_metadata["tag"])
            
            # Add any other metadata fields (with sanitized keys)
            for key, value in route_metadata.items():
                if key not in ["distance", "length", "jurisdiction", "project_id", 
                              "route_name", "route_type", "tag"]:
                    # Convert snake_case to camelCase for consistency
                    camel_key = "".join(
                        word.capitalize() if i > 0 else word 
                        for i, word in enumerate(key.split("_"))
                    )
                    # Handle different value types for Firestore
                    if value is not None:
                        if isinstance(value, (int, float)):
                            doc_data[camel_key] = value
                        elif isinstance(value, bool):
                            doc_data[camel_key] = value
                        else:
                            doc_data[camel_key] = str(value)
        
        # Write/update document with route_id as document ID for uniqueness
        # Use merge=True to preserve existing fields, set() to overwrite
        doc_ref.set(doc_data, merge=False)  # Overwrite to ensure all fields are updated
        
        action = "updated" if is_update else "created"
        logger.info(f"Successfully logged route {action} to Firestore: {route_id}")
        return True
        
    except gcp_exceptions.PermissionDenied as e:
        # Permission denied error
        if not _database_missing_warned:
            project_id = os.getenv("GOOGLE_CLOUD_PROJECT", "rmi-sandbox")
            logger.error(
                f"Permission denied accessing Firestore for project {project_id}. "
                f"Please check IAM permissions for the service account."
            )
            logger.error(
                f"The service account needs 'Cloud Datastore User' or 'Firestore User' role. "
                f"Check: https://console.cloud.google.com/iam-admin/iam?project={project_id}"
            )
            _database_missing_warned = True
        else:
            logger.debug(f"Permission denied (already warned): {e}")
        return False
    except gcp_exceptions.NotFound as e:
        # Database doesn't exist error
        error_msg = str(e)
        
        is_database_missing = (
            "database" in error_msg.lower() and 
            "does not exist" in error_msg.lower()
        )
        
        if is_database_missing:
            if not _database_missing_warned:
                project_id = os.getenv("GOOGLE_CLOUD_PROJECT", "rmi-sandbox")
                logger.error(
                    f"Cloud Firestore database '(default)' is not accessible via Google Cloud API for project {project_id}."
                )
                logger.error(
                    f"NOTE: Even if you see a database in Firebase Console, it must be accessible via Google Cloud API."
                )
                logger.error(
                    f"Check these:\n"
                    f"1. Firestore API enabled: "
                    f"https://console.cloud.google.com/apis/library/firestore.googleapis.com?project={project_id}\n"
                    f"2. Create database via Google Cloud Console: "
                    f"https://console.cloud.google.com/firestore/databases?project={project_id}\n"
                    f"   (Select 'Firestore Native' mode, choose location, create)\n"
                    f"3. IAM permissions: "
                    f"https://console.cloud.google.com/iam-admin/iam?project={project_id}"
                )
                _database_missing_warned = True
            else:
                logger.debug(f"Database not found (already warned): {error_msg}")
        else:
            logger.error(f"Firestore NotFound error for route {route_id}: {e}")
        return False
    except Exception as e:
        error_msg = str(e)
        
        # Check if it's a database doesn't exist error (404 in error message)
        is_database_missing = (
            "404" in error_msg and
            "database" in error_msg.lower() and
            "does not exist" in error_msg.lower()
        )
        
        if is_database_missing:
            if not _database_missing_warned:
                project_id = os.getenv("GOOGLE_CLOUD_PROJECT", "rmi-sandbox")
                logger.error(
                    f"Cloud Firestore database '(default)' is not accessible via Google Cloud API for project {project_id}."
                )
                logger.error(
                    f"NOTE: Even if you see a database in Firebase Console, it must be accessible via Google Cloud API."
                )
                logger.error(
                    f"Check these:\n"
                    f"1. Firestore API enabled: "
                    f"https://console.cloud.google.com/apis/library/firestore.googleapis.com?project={project_id}\n"
                    f"2. Create database via Google Cloud Console: "
                    f"https://console.cloud.google.com/firestore/databases?project={project_id}\n"
                    f"   (Select 'Firestore Native' mode, choose location, create)\n"
                    f"3. IAM permissions: "
                    f"https://console.cloud.google.com/iam-admin/iam?project={project_id}"
                )
                _database_missing_warned = True
            else:
                logger.debug(f"Database not found (already warned): {error_msg}")
        else:
            logger.error(f"Error logging route creation for {route_id}: {e}")
            logger.debug(f"Full error details: {type(e).__name__}: {error_msg}")
        return False

def is_firebase_initialized() -> bool:
    """
    Check if Firestore is initialized and ready to use.
    
    Returns:
        True if Firestore is initialized, False otherwise
    """
    return _firestore_client is not None
