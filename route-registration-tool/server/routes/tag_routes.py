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


from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import logging
from server.utils.tag import rename_tag, delete_routes_by_tag, fetch_routes_by_tag, move_tag
from server.utils.segment import segment_routes_for_visualization, save_route_segments_from_geojson
from server.utils.stretch import create_stretches
from server.utils.sync_routes import execute_sync

router = APIRouter()

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
ch = logging.StreamHandler()
ch.setLevel(logging.INFO)
formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
ch.setFormatter(formatter)
logger.addHandler(ch)

class TagRoutesConfig(BaseModel):
    db_project_id: int
    tag: str

class TagConfig(BaseModel):
    db_project_id: int
    tag: str
    new_tag: str

class SegmentTagConfig(BaseModel):
    db_project_id: int
    tag: str
    distance_km: float

class SaveSegmentedTagConfig(BaseModel):
    db_project_id: int
    tag: str
    feature_collection: dict

class SyncTagRoutesConfig(BaseModel):
    db_project_id: int
    project_number: str
    gcp_project_id: str
    tag: str

@router.post("/rename-tag")
async def rename_tag_route(config: TagConfig):
    return rename_tag(config.db_project_id, config.tag, config.new_tag)

@router.post("/move-tag")
async def move_tag_route(config: TagConfig):
    return move_tag(config.db_project_id, config.tag, config.new_tag)

@router.post("/delete-tag")
async def delete_tag_route(config: TagRoutesConfig):
    return delete_routes_by_tag(config.db_project_id, config.tag)

@router.post("/fetch-tag")
async def fetch_tag_route(config: TagRoutesConfig):
    return fetch_routes_by_tag(config.db_project_id, config.tag)

@router.post("/segment-tag")
async def segment_tag_route(config: SegmentTagConfig):
    features, count = segment_routes_for_visualization(config.db_project_id, config.tag, config.distance_km)
    if count == 0:
        return {"status_code": 404, "message": features["message"]}
    else:
        return save_route_segments_from_geojson(config.db_project_id, config.tag, features, count)

@router.post("/stretch-tag")
async def stretch_tag_route(config: TagRoutesConfig):
    return create_stretches(config.db_project_id, config.tag)
