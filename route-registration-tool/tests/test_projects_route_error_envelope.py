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

import pytest
from fastapi import HTTPException
from fastapi.responses import JSONResponse

from server.db.common import ProjectNameConflict
from server.routes.projects import (
    FormatAndCreateRequest,
    ProjectCreate,
    ProjectFormatAndCreate,
    create_project,
    format_and_create_projects,
)


def _geojson_polygon() -> str:
    payload = {
        "type": "Polygon",
        "coordinates": [
            [
                [0.0, 0.0],
                [0.0, 1.0],
                [1.0, 1.0],
                [1.0, 0.0],
                [0.0, 0.0],
            ]
        ],
    }
    return json.dumps(payload)


@pytest.mark.asyncio
async def test_create_project_repo_domain_error_becomes_http_exception(monkeypatch):
    async def _fake_create_project(**kwargs):
        raise ProjectNameConflict(detail="nope")

    monkeypatch.setattr(
        "server.routes.projects.projects_repo.create_project", _fake_create_project
    )

    data = ProjectCreate(
        project_name="Alpha",
        jurisdiction_boundary_geojson=_geojson_polygon(),
        google_cloud_project_id="gcp-1",
        google_cloud_project_number="123",
        subscription_id="sub-1",
        dataset_name="dataset-1",
    )

    with pytest.raises(HTTPException) as exc_info:
        await create_project(data)

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "nope"


@pytest.mark.asyncio
async def test_create_project_unexpected_error_returns_500_envelope_with_sanitized_error(
    monkeypatch,
):
    async def _fake_create_project(**kwargs):
        msg = (
            "boom http://user:postgres@localhost:8000\n\tsecret..."
            + (" x" * 1000)
        )
        raise RuntimeError(msg)

    monkeypatch.setattr(
        "server.routes.projects.projects_repo.create_project", _fake_create_project
    )

    data = ProjectCreate(
        project_name="Alpha",
        jurisdiction_boundary_geojson=_geojson_polygon(),
        google_cloud_project_id="gcp-1",
        google_cloud_project_number="123",
        subscription_id="sub-1",
        dataset_name="dataset-1",
    )

    resp = await create_project(data)
    assert isinstance(resp, JSONResponse)
    assert resp.status_code == 500

    body = json.loads(resp.body.decode("utf-8"))
    assert body["detail"] == "Failed to create project"

    err = body["error"]
    assert "://user:***@" in err
    assert "postgres" not in err
    assert "\n" not in err
    assert "\t" not in err
    assert len(err) <= 400
    assert err.endswith("...")


@pytest.mark.asyncio
async def test_create_project_success_returns_project_out(monkeypatch):
    async def _fake_create_project(**kwargs):
        return {
            "id": 123,
            "project_uuid": kwargs.get("project_uuid") or "uuid",
            "project_name": kwargs["project_name"],
            "jurisdiction_boundary_geojson": kwargs["jurisdiction_boundary_geojson"],
            "google_cloud_project_id": kwargs.get("google_cloud_project_id"),
            "google_cloud_project_number": kwargs.get("google_cloud_project_number"),
            "subscription_id": kwargs.get("subscription_id"),
            "dataset_name": kwargs.get("dataset_name"),
            "viewstate": kwargs.get("viewstate_json"),
            "map_snapshot": None,
            "created_at": None,
            "updated_at": None,
            "deleted_at": None,
        }

    monkeypatch.setattr(
        "server.routes.projects.projects_repo.create_project", _fake_create_project
    )

    data = ProjectCreate(
        project_name="Alpha",
        jurisdiction_boundary_geojson=_geojson_polygon(),
        google_cloud_project_id="gcp-1",
        google_cloud_project_number="123",
        subscription_id="sub-1",
        dataset_name="dataset-1",
    )

    out = await create_project(data)
    assert out.id == 123
    assert out.project_name == "Alpha"


@pytest.mark.asyncio
async def test_format_and_create_unexpected_error_returns_500_envelope_with_sanitized_error(
    monkeypatch,
):
    async def _fake_create_project(**kwargs):
        msg = (
            "boom http://user:postgres@localhost:8000\n\tsecret..."
            + (" x" * 1000)
        )
        raise RuntimeError(msg)

    monkeypatch.setattr(
        "server.routes.projects.projects_repo.create_project", _fake_create_project
    )

    req = FormatAndCreateRequest(
        data=[
            ProjectFormatAndCreate(
                project_name="Alpha",
                geojson=_geojson_polygon(),
                google_cloud_project_id="gcp-1",
                google_cloud_project_number="123",
                subscription_id="sub-1",
                dataset_name="dataset-1",
            )
        ]
    )

    resp = await format_and_create_projects(req)
    assert isinstance(resp, JSONResponse)
    assert resp.status_code == 500

    body = json.loads(resp.body.decode("utf-8"))
    assert body["detail"] == "Failed to create projects"

    err = body["error"]
    assert "://user:***@" in err
    assert "postgres" not in err
    assert "\n" not in err
    assert "\t" not in err
    assert len(err) <= 400
    assert err.endswith("...")


@pytest.mark.asyncio
async def test_format_and_create_domain_conflict_maps_to_http_400(monkeypatch):
    async def _fake_create_project(**kwargs):
        raise ProjectNameConflict(detail="name conflict")

    monkeypatch.setattr(
        "server.routes.projects.projects_repo.create_project", _fake_create_project
    )

    req = FormatAndCreateRequest(
        data=[
            ProjectFormatAndCreate(
                project_name="Alpha",
                geojson=_geojson_polygon(),
            )
        ]
    )

    with pytest.raises(HTTPException) as exc_info:
        await format_and_create_projects(req)

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "name conflict"


@pytest.mark.asyncio
async def test_format_and_create_success_returns_inserted_ids(monkeypatch):
    created_ids = [111, 222]

    async def _fake_create_project(**kwargs):
        return {"id": created_ids.pop(0)}

    monkeypatch.setattr(
        "server.routes.projects.projects_repo.create_project", _fake_create_project
    )

    req = FormatAndCreateRequest(
        data=[
            ProjectFormatAndCreate(project_name="Alpha", geojson=_geojson_polygon()),
            ProjectFormatAndCreate(project_name="Beta", geojson=_geojson_polygon()),
        ]
    )

    out = await format_and_create_projects(req)
    assert out.inserted_ids == [111, 222]

