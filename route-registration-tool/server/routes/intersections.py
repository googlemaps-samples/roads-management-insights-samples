import logging
from fastapi import APIRouter, HTTPException
from server.utils.intersection_points import find_intersection_points

router = APIRouter()
logger = logging.getLogger("intersections")

@router.get("/intersections")
async def get_intersections(encoded_polyline_str: str):
    """Get intersections"""
    intersection_feature_collection = await find_intersection_points(encoded_polyline_str)
    logger.info(f"Found intersection feature collection for encoded polyline: {encoded_polyline_str}")
    return intersection_feature_collection
