# server/routes/users.py
import logging
import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from server.db.database import query_db

# Setup logger
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("users_api")

router = APIRouter(prefix="/users", tags=["Users"])

# --------------------------
# Pydantic Models
# --------------------------

class UserPreferencesUpdate(BaseModel):
    """Model for updating user preferences"""
    distance_unit: Optional[str] = Field(None, description="Distance unit: 'km' or 'miles'")
    google_cloud_account: Optional[str] = Field(None, description="Google Cloud account identifier")
    show_tooltip: Optional[bool] = Field(None, description="Show tooltips on map features")
    show_instructions: Optional[bool] = Field(None, description="Show instructions in Dynamic Island")
    route_color_mode: Optional[str] = Field(None, description="Route color mode: 'sync_status' or 'traffic_status'")

class UserPreferencesOut(BaseModel):
    """Model for user preferences response"""
    id: int
    distance_unit: str
    google_cloud_account: Optional[str] = None
    show_tooltip: bool
    show_instructions: bool
    route_color_mode: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

# --------------------------
# Helper Functions
# --------------------------

def row_to_preferences_out(row) -> UserPreferencesOut:
    """Convert database row to UserPreferencesOut model"""
    # sqlite3.Row objects use bracket notation, not .get()
    # NULL values will be None in Python
    # show_tooltip and show_instructions are stored as INTEGER (0 or 1) in SQLite, convert to bool
    # Check if column exists in row (for backward compatibility)
    try:
        show_tooltip_value = row["show_tooltip"]
        show_tooltip = bool(show_tooltip_value) if show_tooltip_value is not None else True
    except (KeyError, IndexError):
        # Column doesn't exist (old database), default to True
        show_tooltip = True
    
    try:
        show_instructions_value = row["show_instructions"]
        show_instructions = bool(show_instructions_value) if show_instructions_value is not None else True
    except (KeyError, IndexError):
        # Column doesn't exist (old database), default to True
        show_instructions = True
    # Check if route_color_mode column exists (for backward compatibility)
    try:
        route_color_mode = row["route_color_mode"] or "sync_status"
    except (KeyError, IndexError):
        # Column doesn't exist (old database), default to sync_status
        route_color_mode = "sync_status"
    
    return UserPreferencesOut(
        id=row["id"],
        distance_unit=row["distance_unit"],
        google_cloud_account=row["google_cloud_account"] if row["google_cloud_account"] else None,
        show_tooltip=show_tooltip,
        show_instructions=show_instructions,
        route_color_mode=route_color_mode,
        created_at=row["created_at"],
        updated_at=row["updated_at"]
    )

# --------------------------
# API Endpoints
# --------------------------

@router.get("/preferences", response_model=UserPreferencesOut)
async def get_user_preferences():
    """Get current user preferences (single user system)"""
    try:
        logger.info("Fetching user preferences")
        
        # Get the default user (id=1)
        query = """
        SELECT id, distance_unit, google_cloud_account, show_tooltip, route_color_mode, show_instructions, created_at, updated_at
        FROM users
        WHERE id = 1
        """
        
        row = await query_db(query, (), one=True)
        
        if not row:
            # Create default user if it doesn't exist
            logger.info("Default user not found, creating...")
            create_query = """
            INSERT INTO users (id, distance_unit, google_cloud_account, show_tooltip, show_instructions,route_color_mode)
            VALUES (1, 'km', NULL, 1, 1,'sync_status')
            """
            await query_db(create_query, (), commit=True)
            
            # Fetch the newly created user
            row = await query_db(query, (), one=True)
        
        preferences = row_to_preferences_out(row)
        logger.info(f"Found user preferences: distance_unit={preferences.distance_unit}")
        
        return preferences
        
    except Exception as e:
        logger.error(f"Error fetching user preferences: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch user preferences")

@router.put("/preferences", response_model=UserPreferencesOut)
async def update_user_preferences(preferences_data: UserPreferencesUpdate):
    """Update user preferences"""
    try:
        logger.info("Updating user preferences")
        
        # Validate distance_unit if provided
        if preferences_data.distance_unit is not None:
            if preferences_data.distance_unit not in ['km', 'miles']:
                raise HTTPException(
                    status_code=400,
                    detail="distance_unit must be either 'km' or 'miles'"
                )
        
        # Validate route_color_mode if provided
        if preferences_data.route_color_mode is not None:
            if preferences_data.route_color_mode not in ['sync_status', 'traffic_status']:
                raise HTTPException(
                    status_code=400,
                    detail="route_color_mode must be either 'sync_status' or 'traffic_status'"
                )
        
        # Build dynamic update query
        update_fields = []
        update_values = []
        
        if preferences_data.distance_unit is not None:
            update_fields.append("distance_unit = ?")
            update_values.append(preferences_data.distance_unit)
        
        if preferences_data.google_cloud_account is not None:
            update_fields.append("google_cloud_account = ?")
            update_values.append(preferences_data.google_cloud_account)
        
        if preferences_data.show_tooltip is not None:
            # Convert bool to INTEGER (0 or 1) for SQLite
            update_fields.append("show_tooltip = ?")
            update_values.append(1 if preferences_data.show_tooltip else 0)
        
        if preferences_data.show_instructions is not None:
            # Convert bool to INTEGER (0 or 1) for SQLite
            update_fields.append("show_instructions = ?")
            update_values.append(1 if preferences_data.show_instructions else 0)
        if preferences_data.route_color_mode is not None:
            update_fields.append("route_color_mode = ?")
            update_values.append(preferences_data.route_color_mode)
        
        if not update_fields:
            # No fields to update, return current preferences
            return await get_user_preferences()
        
        update_fields.append("updated_at = CURRENT_TIMESTAMP")
        update_values.append(1)  # user id
        
        query = f"""
        UPDATE users 
        SET {', '.join(update_fields)}
        WHERE id = ?
        """
        
        await query_db(query, tuple(update_values), commit=True)
        
        # Fetch the updated preferences
        updated_preferences = await get_user_preferences()
        logger.info(f"Updated user preferences: distance_unit={updated_preferences.distance_unit}, show_tooltip={updated_preferences.show_tooltip}, show_instructions={updated_preferences.show_instructions}")
        
        return updated_preferences
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating user preferences: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update user preferences")

