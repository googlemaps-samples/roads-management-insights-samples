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

import importlib
import json
import uuid

import pytest


def _geojson_polygon() -> str:
    # calculate_viewstate expects rings as [lon, lat] pairs.
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


def _expected_project_name_detail(project_name: str) -> str:
    return (
        f"A project with the name '{project_name}' already exists. "
        "Please choose a different name."
    )


def _expected_gcp_detail(gcp_id: str, existing_project_name: str) -> str:
    return (
        f"A project with Google Cloud Project ID '{gcp_id}' already exists "
        f"(Project: '{existing_project_name}'). Each GCP project can only be used once."
    )


async def _setup_sqlite(tmp_path, monkeypatch):
    monkeypatch.setenv("GCS_DB_BACKUP_ENABLED", "false")

    db_file = tmp_path / f"test_projects_repo_{uuid.uuid4().hex}.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{db_file}")

    import server.db.common as database

    importlib.reload(database)

    # init_db_sqlite imports DB at module-import time, so reload it too.
    import server.db.sqlite as init_sqlite

    importlib.reload(init_sqlite)
    init_sqlite.init_db_sqlite()

    # Ensure repo uses the reloaded DB/query_db (it lazy-imports, but we reset anyway).
    import server.db.common as projects_repo

    importlib.reload(projects_repo)
    return database, projects_repo


@pytest.mark.asyncio
async def test_duplicate_project_name_conflict(monkeypatch, tmp_path):
    database, projects_repo = await _setup_sqlite(tmp_path, monkeypatch)
    geojson = _geojson_polygon()

    await projects_repo.create_project(
        project_name="Alpha",
        jurisdiction_boundary_geojson=geojson,
        google_cloud_project_id="gcp-1",
        google_cloud_project_number="123",
        subscription_id="sub-1",
        dataset_name="dataset-1",
        enable_multitenant=True,
    )

    with pytest.raises(projects_repo.ProjectNameConflict) as exc_info:
        await projects_repo.create_project(
            project_name="Alpha",
            jurisdiction_boundary_geojson=geojson,
            google_cloud_project_id="gcp-2",
            google_cloud_project_number="456",
            subscription_id="sub-2",
            dataset_name="dataset-2",
            enable_multitenant=True,
        )

    assert exc_info.value.detail == _expected_project_name_detail("Alpha")

    await database.dispose_async_engine()


@pytest.mark.asyncio
async def test_same_project_name_allowed_for_different_sessions(monkeypatch, tmp_path):
    database, projects_repo = await _setup_sqlite(tmp_path, monkeypatch)
    geojson = _geojson_polygon()
    sid_a = str(uuid.uuid4())
    sid_b = str(uuid.uuid4())

    created_a = await projects_repo.create_project(
        project_name="SharedName",
        jurisdiction_boundary_geojson=geojson,
        google_cloud_project_id="gcp-a",
        google_cloud_project_number="111",
        subscription_id="sub-a",
        dataset_name="dataset-a",
        enable_multitenant=True,
        session_id=sid_a,
    )
    created_b = await projects_repo.create_project(
        project_name="SharedName",
        jurisdiction_boundary_geojson=geojson,
        google_cloud_project_id="gcp-b",
        google_cloud_project_number="222",
        subscription_id="sub-b",
        dataset_name="dataset-b",
        enable_multitenant=True,
        session_id=sid_b,
    )

    assert created_a[2] == "SharedName"
    assert created_b[2] == "SharedName"
    assert created_a[0] != created_b[0]

    await database.dispose_async_engine()


@pytest.mark.asyncio
async def test_duplicate_project_name_same_session_still_conflict(
    monkeypatch, tmp_path
):
    database, projects_repo = await _setup_sqlite(tmp_path, monkeypatch)
    geojson = _geojson_polygon()
    sid = str(uuid.uuid4())

    await projects_repo.create_project(
        project_name="Dup",
        jurisdiction_boundary_geojson=geojson,
        google_cloud_project_id="gcp-1",
        google_cloud_project_number="123",
        subscription_id="sub-1",
        dataset_name="dataset-1",
        enable_multitenant=True,
        session_id=sid,
    )

    with pytest.raises(projects_repo.ProjectNameConflict) as exc_info:
        await projects_repo.create_project(
            project_name="Dup",
            jurisdiction_boundary_geojson=geojson,
            google_cloud_project_id="gcp-2",
            google_cloud_project_number="456",
            subscription_id="sub-2",
            dataset_name="dataset-2",
            enable_multitenant=True,
            session_id=sid,
        )

    assert exc_info.value.detail == _expected_project_name_detail("Dup")

    await database.dispose_async_engine()


@pytest.mark.asyncio
async def test_duplicate_gcp_project_id_raises_when_multitenant_disabled(
    monkeypatch, tmp_path
):
    database, projects_repo = await _setup_sqlite(tmp_path, monkeypatch)
    geojson = _geojson_polygon()

    await projects_repo.create_project(
        project_name="AppProject1",
        jurisdiction_boundary_geojson=geojson,
        google_cloud_project_id="gcp-1",
        google_cloud_project_number="123",
        subscription_id="sub-1",
        dataset_name="dataset-1",
        enable_multitenant=False,
    )

    with pytest.raises(projects_repo.GoogleCloudProjectIdConflict) as exc_info:
        await projects_repo.create_project(
            project_name="AppProject2",
            jurisdiction_boundary_geojson=geojson,
            google_cloud_project_id="gcp-1",
            google_cloud_project_number="999",
            subscription_id="sub-2",
            dataset_name="dataset-2",
            enable_multitenant=False,
        )

    assert (
        exc_info.value.detail
        == _expected_gcp_detail("gcp-1", existing_project_name="AppProject1")
    )

    await database.dispose_async_engine()


@pytest.mark.asyncio
async def test_duplicate_gcp_project_id_succeeds_when_multitenant_enabled(
    monkeypatch, tmp_path
):
    database, projects_repo = await _setup_sqlite(tmp_path, monkeypatch)
    geojson = _geojson_polygon()

    await projects_repo.create_project(
        project_name="AppProject1",
        jurisdiction_boundary_geojson=geojson,
        google_cloud_project_id="gcp-1",
        google_cloud_project_number="123",
        subscription_id="sub-1",
        dataset_name="dataset-1",
        enable_multitenant=True,
    )

    created = await projects_repo.create_project(
        project_name="AppProject2",
        jurisdiction_boundary_geojson=geojson,
        google_cloud_project_id="gcp-1",
        google_cloud_project_number="999",
        subscription_id="sub-2",
        dataset_name="dataset-2",
        enable_multitenant=True,
    )

    # get_project_row columns order:
    # (id, project_uuid, project_name, jurisdiction_boundary_geojson, ...)
    assert created[2] == "AppProject2"

    await database.dispose_async_engine()


@pytest.mark.asyncio
async def test_postgres_unique_violation_maps_23505_to_project_name_conflict(
    monkeypatch, tmp_path
):
    database, projects_repo = await _setup_sqlite(tmp_path, monkeypatch)

    real_query_db = database.query_db

    async def fake_query_db(query, args=(), one=False, commit=False, conn=None):
        q = str(query).lstrip().lower()
        if commit and q.startswith("insert"):
            exc = Exception("duplicate key")
            setattr(exc, "sqlstate", "23505")
            raise exc
        return await real_query_db(query, args, one=one, commit=commit, conn=conn)

    # Monkeypatch `query_db` in this module as requested.
    monkeypatch.setattr(projects_repo, "query_db", fake_query_db)

    geojson = _geojson_polygon()
    with pytest.raises(projects_repo.ProjectNameConflict) as exc_info:
        await projects_repo.create_project(
            project_name="RaceName",
            jurisdiction_boundary_geojson=geojson,
            google_cloud_project_id="gcp-1",
            google_cloud_project_number="123",
            subscription_id="sub-1",
            dataset_name="dataset-1",
            enable_multitenant=True,
        )

    assert exc_info.value.detail == _expected_project_name_detail("RaceName")

    await database.dispose_async_engine()

