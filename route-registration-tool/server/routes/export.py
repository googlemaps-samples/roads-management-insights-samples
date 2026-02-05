import json
import io
import zipfile
import logging
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse, Response
from sqlalchemy import text
from server.utils.create_engine import engine
import polyline

router = APIRouter()
logger = logging.getLogger("project_export")


def export_project_with_routes_as_bytes(project_id: int) -> io.BytesIO:
    """
    Export project + routes as a .zip file
    """

    with engine.begin() as conn:

        project = conn.execute(text("""
            SELECT 
                id,
                project_name,
                jurisdiction_boundary_geojson,
                google_cloud_project_id,
                google_cloud_project_number,
                subscription_id,
                dataset_name,
                viewstate,
                map_snapshot
            FROM projects
            WHERE id = :project_id
              AND deleted_at IS NULL;
        """), {"project_id": project_id}).fetchone()

        if project is None:
            raise ValueError(f"Project with id {project_id} not found.")

        project_dict = dict(project._mapping)

        project_name = project_dict.get("project_name")

        routes = conn.execute(text("""
            SELECT *
            FROM routes
            WHERE project_id = :project_id
        """), {"project_id": project_id}).mappings().all()

        routes_list = [dict(r) for r in routes]

    export_json = {
        "project": project_dict,
        "routes": routes_list
    }

    json_bytes = json.dumps(export_json, indent=4).encode("utf-8")

    mem_file = io.BytesIO()
    with zipfile.ZipFile(mem_file, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"export_{project_name}.json", json_bytes)

    mem_file.seek(0)
    return mem_file, project_name

@router.get("/export_project/{project_id}")
async def export_project(project_id: int):
    """
    Export project + routes as a .zip file
    """

    try:
        zip_bytes_io, project_name = export_project_with_routes_as_bytes(project_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception("Unexpected error exporting project")
        raise HTTPException(status_code=500, detail="Internal server error")

    filename = f"{project_name}.zip"

    return StreamingResponse(
        zip_bytes_io,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        },
    )


def decode_polyline_to_geojson(encoded_polyline: str) -> dict | None:
    """
    Decode encoded polyline to GeoJSON LineString format.
    Handles both Google-encoded polylines and JSON coordinate arrays.
    """
    if not encoded_polyline:
        return None
    
    try:
        # Try to parse as JSON array of coordinates first
        try:
            coords = json.loads(encoded_polyline)
            if isinstance(coords, list) and len(coords) > 0:
                # Check if coordinates are in [lat, lng] or [lng, lat] format
                first_coord = coords[0]
                if isinstance(first_coord, list) and len(first_coord) == 2:
                    # Check coordinate ranges to determine format
                    first_val = abs(first_coord[0])
                    second_val = abs(first_coord[1])
                    
                    # If first value is <= 90, it's likely latitude (lat, lng format)
                    if first_val <= 90 and second_val <= 180:
                        # Convert from [lat, lng] to [lng, lat] (GeoJSON format)
                        coords = [[coord[1], coord[0]] for coord in coords]
                    # Otherwise assume it's already [lng, lat] format
                    
                    return {
                        "type": "LineString",
                        "coordinates": coords
                    }
        except (json.JSONDecodeError, ValueError):
            # Not JSON, try as Google-encoded polyline
            pass
        
        # Decode as Google-encoded polyline
        # polyline.decode returns [(lat, lng), ...]
        decoded_coords = polyline.decode(encoded_polyline)
        if not decoded_coords:
            return None
        
        # Convert to GeoJSON format [lng, lat]
        geojson_coords = [[lng, lat] for lat, lng in decoded_coords]
        
        return {
            "type": "LineString",
            "coordinates": geojson_coords
        }
    except Exception as e:
        logger.warning(f"Failed to decode polyline: {e}")
        return None


@router.get("/export_routes_geojson/{project_id}")
async def export_routes_geojson(project_id: int):
    """
    Export routes/segments as GeoJSON FeatureCollection.
    For segmented routes, exports segments instead of parent route.
    Includes all routes regardless of sync_status.
    Only excludes routes that are deleted (deleted_at IS NOT NULL).
    """
    try:
        with engine.begin() as conn:
            # Verify project exists
            project = conn.execute(text("""
                SELECT project_name
                FROM projects
                WHERE id = :project_id
                  AND deleted_at IS NULL;
            """), {"project_id": project_id}).fetchone()
            
            if project is None:
                raise ValueError(f"Project with id {project_id} not found.")
            
            project_name = project.project_name
            
            # Get all routes/segments for export (except deleted ones)
            # Include:
            # 1. Regular routes (is_segmented = FALSE)
            # 2. Segments (parent_route_id IS NOT NULL)
            # Exclude parent routes that have segments (is_segmented = TRUE AND parent_route_id IS NULL)
            # Include all routes regardless of sync_status, only exclude deleted routes
            routes = conn.execute(text("""
                SELECT 
                    uuid,
                    route_name,
                    encoded_polyline,
                    sync_status,
                    is_enabled,
                    is_segmented,
                    parent_route_id,
                    tag,
                    route_type,
                    length
                FROM routes
                WHERE project_id = :project_id
                  AND deleted_at IS NULL
                  AND encoded_polyline IS NOT NULL
                  AND (is_segmented = FALSE OR parent_route_id IS NOT NULL)
            """), {"project_id": project_id}).mappings().all()
            
            features = []
            
            for route in routes:
                # Additional safety check: skip parent routes that are segmented
                # (SQL query should already filter these, but keeping as safety check)
                if route["is_segmented"] and route["parent_route_id"] is None:
                    continue
                
                # Decode polyline to GeoJSON LineString
                geometry = decode_polyline_to_geojson(route["encoded_polyline"])
                if not geometry:
                    continue
                
                # Create GeoJSON feature
                feature = {
                    "type": "Feature",
                    "geometry": geometry,
                    "properties": {
                        "uuid": route["uuid"],
                        "name": route["route_name"],
                        "sync_status": route["sync_status"],
                        "tag": route["tag"],
                        "route_type": route["route_type"],
                        "length": route["length"]
                    }
                }
                features.append(feature)
            
            # Create GeoJSON FeatureCollection
            geojson = {
                "type": "FeatureCollection",
                "features": features
            }
            
            # Convert to JSON string
            geojson_str = json.dumps(geojson, indent=2)
            
            filename = f"{project_name}.geojson"
            
            return Response(
                content=geojson_str,
                media_type="application/geo+json",
                headers={
                    "Content-Disposition": f'attachment; filename="{filename}"'
                }
            )
            
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception("Unexpected error exporting routes GeoJSON")
        raise HTTPException(status_code=500, detail="Internal server error")