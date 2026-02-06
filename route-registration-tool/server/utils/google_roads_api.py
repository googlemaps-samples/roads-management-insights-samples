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


import json
from typing import Optional
import logging
import httpx
import asyncio
import time
from contextlib import asynccontextmanager
from dotenv import load_dotenv
import os
from .auth import get_oauth_token

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env"))
API_URL = os.getenv('API_URL')


# -------------------------
# CUSTOM EXCEPTIONS
# -------------------------
class RouteCreationError(Exception):
    """
    Custom exception for route creation errors with error code and details.
    
    Attributes:
        status_code: HTTP status code (400, 401, 403, etc.)
        message: Error message from the API
        error_details: Full error response dict from the API
        is_retryable: Whether this error should be retried (e.g., 401 auth errors)
    """
    def __init__(self, status_code: int, message: str, error_details: Optional[dict] = None):
        self.status_code = status_code
        self.message = message
        self.error_details = error_details or {}
        # 401 errors are retryable (token refresh), 400 errors are not (invalid data)
        self.is_retryable = status_code in (401, 429, 500, 502, 503, 504)
        super().__init__(message)


class RouteListError(Exception):
    """
    Custom exception for route listing errors.
    Raised when list_routes API call fails.
    """
    def __init__(self, status_code: int, message: str, error_details: Optional[dict] = None):
        self.status_code = status_code
        self.message = message
        self.error_details = error_details or {}
        super().__init__(message)


logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

timeout = httpx.Timeout(
    connect=10.0,
    read=60.0,
    write=10.0,
    pool=10.0,
)

TIMEOUT_SECS = 30
MAX_PARALLEL = 100  # Maximum parallel requests

# --- OAuth Token Caching ---
cached_token = None
token_timestamp = 0.0
token_lock = asyncio.Lock()
TOKEN_EXPIRY_SECONDS = 45 * 60  # 45 minutes (5 min buffer before 50 min expiry)

async def get_cached_oauth_token():
    """
    Get OAuth token from cache if valid, otherwise refresh and cache it.
    Token expires after 50 minutes, so we refresh if older than 45 minutes.
    """
    global cached_token, token_timestamp
    now = time.monotonic()
    
    # Check if token is still valid (within 45 minutes)
    if cached_token and (now - token_timestamp) < TOKEN_EXPIRY_SECONDS:
        return cached_token
    
    # Token expired or missing - refresh it
    async with token_lock:
        # Double-check after acquiring lock (another coroutine might have refreshed)
        now = time.monotonic()
        if cached_token and (now - token_timestamp) < TOKEN_EXPIRY_SECONDS:
            return cached_token
        
        # Refresh token
        cached_token = await get_oauth_token()
        token_timestamp = time.monotonic()
        return cached_token


async def invalidate_token_cache():
    """
    Force token refresh on next request by invalidating the cached token.
    Used when receiving 401 UNAUTHENTICATED errors to trigger token refresh.
    """
    global cached_token, token_timestamp
    async with token_lock:
        cached_token = None
        token_timestamp = 0.0
        logger.info("Token cache invalidated - next request will fetch fresh token")


# --- Connection Pooling ---
@asynccontextmanager
async def _ac(timeout=TIMEOUT_SECS):
    """
    Shared async client for connection pooling and HTTP/2 multiplexing.
    Reuses connections across requests for better performance.
    """
    limits = httpx.Limits(
        max_connections=MAX_PARALLEL,
        max_keepalive_connections=MAX_PARALLEL
    )
    async with httpx.AsyncClient(timeout=timeout, limits=limits) as client:
        yield client

# -------------------------
# GENERIC HELPERS
# -------------------------

async def _headers(project_number, token):
    return {
        "Authorization": f"Bearer {token}",
        "X-Goog-User-Project": project_number
    }

async def _headers_json(project_number, token):
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "X-Goog-User-Project": project_number
    }

# -------------------------
# PREPARE PAYLOAD
# -------------------------
async def prepare_payload(rows, project_number):
    requests_list = []
    for row in rows:
        # Handle both dictionary and tuple formats
        if isinstance(row, dict):
            uuid = row["uuid"]
            route_name = row["route_name"]
            origin = row["origin"]
            destination = row["destination"]
            waypoints = row["waypoints"]
            length = row["length"]
            tag = row["tag"]
            route_type = row["route_type"]
            # sync_status is available but not used in payload preparation
        else:
            # Fallback for tuple format (if needed for backward compatibility)
            uuid, route_name, origin, destination, waypoints, length, tag, route_type = row[:8]
        
        origin_lat = json.loads(origin)["lat"]
        origin_lng = json.loads(origin)["lng"]
        dest_lat = json.loads(destination)["lat"]
        dest_lng = json.loads(destination)["lng"]

        dynamic_route = {
            "origin": {"latitude": origin_lat, "longitude": origin_lng},
            "destination": {"latitude": dest_lat, "longitude": dest_lng},
        }

        if waypoints:
            wp_list = [{"latitude": wp[1], "longitude": wp[0]} for wp in json.loads(waypoints)]
            if wp_list:
                dynamic_route["intermediates"] = wp_list

        request_obj = {
            "parent": f"projects/{project_number}",
            "selectedRoute": {
                "displayName": route_name,
                "dynamicRoute": dynamic_route,
                "route_attributes": {
                    "length": str(length),
                    "tag": tag if tag else "Untagged",
                    "route_type": route_type,
                    "created_by": "Roads Selection Tool"
                }
            },
            "selectedRouteId": uuid
        }
        requests_list.append(request_obj)

    return {"requests": requests_list}

async def prepare_payload_single(rows):
    for uuid, route_name, origin, destination, waypoints, sync_status, length, tag, route_type in rows:
        origin_lat = json.loads(origin)["lat"]
        origin_lng = json.loads(origin)["lng"]
        dest_lat = json.loads(destination)["lat"]
        dest_lng = json.loads(destination)["lng"]

        dynamic_route = {
            "origin": {"latitude": origin_lat, "longitude": origin_lng},
            "destination": {"latitude": dest_lat, "longitude": dest_lng},
        }

        if waypoints:
            wp_list = [{"latitude": wp[1], "longitude": wp[0]} for wp in json.loads(waypoints)]
            if wp_list:
                dynamic_route["intermediates"] = wp_list

        request_obj = {
            "displayName": route_name,
            "dynamicRoute": dynamic_route,
            "route_attributes": {
                "length": str(length),
                "tag": tag if tag else "Untagged",
                "route_type": route_type,
                "created_by": "Roads Selection Tool"
            }
        }

    return request_obj

# -------------------------
# GET SINGLE ROUTE
# -------------------------
async def get_route(project_number, route_id):
    """
    Fetch a single selectedRoute from Google Roads API.
    Returns JSON dict or None.
    """
    url = f"{API_URL}{project_number}/selectedRoutes/{route_id}"
    token = await get_oauth_token()
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(url, headers=await _headers(project_number, token))
            if response.status_code == 404:
                return None
            response.raise_for_status()
            return response.json()
    except Exception as e:
        logger.error(f"Error fetching route {route_id}: {e}")
        return None

# -------------------------
# LIST ALL ROUTES (PAGINATION)
# -------------------------
async def list_routes(project_number, page_size=5000):
    """
    Returns a list of all selectedRoutes from Roads API.
    Handles pagination.
    
    Raises:
        RouteListError: If the API call fails (fail-fast behavior)
    """
    all_routes = []
    next_page_token = None
    token = await get_oauth_token()
    page_number = 0
    
    while True:
        url = f"{API_URL}{project_number}/selectedRoutes"
        params = {"pageSize": page_size}
        if next_page_token:
            params["page_token"] = next_page_token

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.get(url, headers=await _headers(project_number, token), params=params)
                
                # Check for HTTP errors
                if response.status_code != 200:
                    try:
                        error_json = response.json()
                        error_obj = error_json.get("error", {})
                        error_message = error_obj.get("message", f"HTTP {response.status_code}")
                    except ValueError:
                        error_message = f"HTTP {response.status_code}: {response.text}"
                    
                    logger.error(f"Failed to list routes (page {page_number}): {error_message}")
                    raise RouteListError(
                        status_code=response.status_code,
                        message=f"Failed to list routes: {error_message}",
                        error_details={
                            "page_number": page_number,
                            "routes_fetched_so_far": len(all_routes),
                        }
                    )
                
                data = response.json()
                routes = data.get("selectedRoutes", [])
                all_routes.extend(routes)
                page_number += 1

                next_page_token = data.get("nextPageToken")
                if not next_page_token:
                    break

        except RouteListError:
            raise
        except httpx.TimeoutException as e:
            logger.error(f"Timeout listing routes (page {page_number}): {e}")
            raise RouteListError(
                status_code=408,
                message=f"Timeout listing routes: {str(e)}",
                error_details={
                    "page_number": page_number,
                    "routes_fetched_so_far": len(all_routes),
                }
            )
        except Exception as e:
            logger.error(f"Error listing routes (page {page_number}): {e}")
            raise RouteListError(
                status_code=500,
                message=f"Failed to list routes: {str(e)}",
                error_details={
                    "page_number": page_number,
                    "routes_fetched_so_far": len(all_routes),
                    "exception": str(e),
                }
            )

    return all_routes

# -------------------------
# DELETE SINGLE ROUTE
# -------------------------
async def delete_route(project_number, route_id, client=None, token=None):
    """
    Delete a specific selectedRoute.
    
    Args:
        project_number: Google Cloud project number
        route_id: Route UUID to delete
        client: Optional shared httpx.AsyncClient for connection pooling
        token: Optional cached OAuth token (if None, fetches fresh token)
    
    Returns:
        True if deleted successfully or does not exist, False otherwise
    """
    url = f"{API_URL}{project_number}/selectedRoutes/{route_id}"
    
    # Use cached token if provided, otherwise fetch fresh token
    if token is None:
        token = await get_oauth_token()
    
    headers = await _headers(project_number, token)
    
    try:
        # Use shared client if provided, otherwise create new client
        if client is not None:
            response = await client.delete(url, headers=headers)
        else:
            async with httpx.AsyncClient(timeout=timeout) as new_client:
                response = await new_client.delete(url, headers=headers)
        
        if response.status_code == 200:
            logger.info(f"Route {route_id} deleted successfully")
            return True
        elif response.status_code == 404:
            logger.info(f"Route {route_id} does not exist, skipping deletion")
            return True
        else:
            logger.error(f"Failed to delete route {route_id}: {response.text}")
            return False
    except Exception as e:
        logger.error(f"Exception deleting route {route_id}: {e}")
        return False


# -------------------------
# SINGLE ROUTE CREATION
# -------------------------
async def create_route(project_number, route_id, payload, client=None, token=None):
    """
    Create a single selectedRoute.
    
    Args:
        project_number: Google Cloud project number
        route_id: Route UUID to create
        payload: The `dynamicRoute` + displayName object
        client: Optional shared httpx.AsyncClient for connection pooling
        token: Optional cached OAuth token (if None, fetches fresh token)
    
    Returns:
        JSON response dict on success
    
    Raises:
        RouteCreationError: On API error with status_code and error_details
    """
    url = (
        f"{API_URL}{project_number}/selectedRoutes?selectedRouteId={route_id}"
    )
    
    # Use cached token if provided, otherwise fetch fresh token
    if token is None:
        token = await get_cached_oauth_token()
    
    headers = await _headers_json(project_number, token)
    
    try:
        # Use shared client if provided, otherwise create new client
        if client is not None:
            response = await client.post(url, headers=headers, json=payload)
        else:
            async with httpx.AsyncClient(timeout=timeout) as new_client:
                response = await new_client.post(url, headers=headers, json=payload)
        
        # Try to parse JSON response (even error responses have JSON body)
        try:
            response_json = response.json()
        except ValueError:
            response_json = {}
        
        # Check for HTTP errors
        if response.status_code != 200:
            # Extract error details from response
            error_obj = response_json.get("error", {})
            error_code = error_obj.get("code", response.status_code)
            error_message = error_obj.get("message", f"API returned status {response.status_code}")
            error_status = error_obj.get("status", "UNKNOWN")
            
            logger.error(
                f"Failed to create route {route_id}: HTTP {response.status_code} - "
                f"Code: {error_code}, Status: {error_status}, Message: {error_message}"
            )
            
            raise RouteCreationError(
                status_code=error_code,
                message=error_message,
                error_details={
                    "http_status": response.status_code,
                    "error_code": error_code,
                    "error_status": error_status,
                    "error_message": error_message,
                    "details": error_obj.get("details", []),
                    "route_id": route_id,
                }
            )
        
        # Check for errors in 200 response body (some APIs return errors in body)
        if response_json.get("error"):
            error_obj = response_json.get("error", {})
            error_code = error_obj.get("code", 500)
            error_message = error_obj.get("message", "Unknown error")
            error_status = error_obj.get("status", "UNKNOWN")
            
            logger.error(
                f"Route creation returned error in body for {route_id}: "
                f"Code: {error_code}, Status: {error_status}, Message: {error_message}"
            )
            
            raise RouteCreationError(
                status_code=error_code,
                message=error_message,
                error_details={
                    "http_status": 200,
                    "error_code": error_code,
                    "error_status": error_status,
                    "error_message": error_message,
                    "details": error_obj.get("details", []),
                    "route_id": route_id,
                }
            )
        
        return response_json
    
    except RouteCreationError:
        raise
    except Exception as e:
        logger.error(f"Exception creating route {route_id}: {e}")
        raise RouteCreationError(
            status_code=500,
            message=f"Failed to create route: {str(e)}",
            error_details={"route_id": route_id, "exception": str(e)}
        )

# -------------------------
# BATCH ROUTE CREATION
# -------------------------
async def create_routes_batch(project_number, payload):
    """
    Batch creation for multiple routes using batchCreate.
    payload must follow batch format:
    {
        "requests": [
            {
                "parent": "...",
                "selectedRoute": {...},
                "selectedRouteId": "uuid"
            }
        ]
    }
    """
    url = f"{API_URL}{project_number}/selectedRoutes:batchCreate"
    token = await get_oauth_token()
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                headers=await _headers_json(project_number, token),
                json = payload,
                timeout=timeout
            )
            logger.info("Status code: %s", response.status_code)
            with open("response_batch_create.txt", "w") as f:
                f.write(response.text)
            response.raise_for_status()

            try:
                data = response.json()
            except ValueError:
                logger.error("Response is not JSON")
                return None

            return data

    except Exception:
        logger.exception("Error in batch route creation")
        return None

# -------------------------
# HELPERS FOR ID SET
# -------------------------
async def list_route_ids(project_number):
    """
    Returns a set of UUIDs for all selectedRoutes.
    """
    routes = await list_routes(project_number)
    ids = set()

    for route in routes:
        try:
            rid = route["name"].split("/")[-1]
            ids.add(rid)
        except Exception:
            continue

    return ids