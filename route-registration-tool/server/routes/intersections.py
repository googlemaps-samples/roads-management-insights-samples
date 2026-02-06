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
