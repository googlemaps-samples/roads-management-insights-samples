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

import io
import json
import uuid
import zipfile

import pytest
from fastapi import HTTPException
from google.cloud import bigquery
from pydantic import ValidationError

from server.routes.import_project import import_project_from_zip
from server.routes.projects import ProjectCreate, ProjectFormatAndCreate, ProjectUpdate
from server.routes.sync import SyncToBigQueryRequest
from server.utils.google_roads_api import RouteListError
from server.utils.sync_routes import (
    _BQ_SYNC_QUERY,
    execute_sync,
    perform_bq_sync,
    validate_bigquery_dataset_id,
    validate_bigquery_identifier,
    validate_gcp_project_id,
)


# =====================================================================
# 1. Pydantic Request Model Validation Tests
# =====================================================================

def test_sync_request_valid_identifiers():
    req = SyncToBigQueryRequest(
        db_project_id=1,
        project_number="123456789",
        gcp_project_id="my-gcp-project-123",
        dataset_name="historical_roads_data",
    )
    assert req.dataset_name == "historical_roads_data"
    assert req.gcp_project_id == "my-gcp-project-123"


def test_sync_request_valid_dataset_with_underscores_and_max_length():
    max_dataset = "d_" + ("a" * 1022)
    req = SyncToBigQueryRequest(
        db_project_id=1,
        project_number="123456789",
        gcp_project_id="test-proj_1",
        dataset_name="dataset_roads_2026",
    )
    assert req.dataset_name == "dataset_roads_2026"

    req_max = SyncToBigQueryRequest(
        db_project_id=1,
        project_number="123456789",
        gcp_project_id="test-proj_1",
        dataset_name=max_dataset,
    )
    assert len(req_max.dataset_name) == 1024


@pytest.mark.parametrize(
    "malicious_dataset",
    [
        "my_dataset.routes_status` UNION ALL SELECT ... --",
        "dataset` OR 1=1 --",
        "dataset; DROP TABLE routes_status;",
        "dataset' OR '1'='1",
        'dataset" OR "1"="1',
        "dataset`",
        "dataset\\",
        "data set",
        "dataset\nUNION SELECT 1",
        "valid_dataset\n",
        "valid_dataset\r\n",
        "dataset-1",
        "dataset_roads-2026",
        "project.dataset",
        "dataset/path",
        "dataset..nested",
        "`dataset`",
        "dätaset_unicode",
        "dataset_道路",
        "",
        "a" * 1025,
    ],
)
def test_sync_request_rejects_malicious_or_invalid_dataset_name(malicious_dataset):
    with pytest.raises(ValidationError) as exc_info:
        SyncToBigQueryRequest(
            db_project_id=1,
            project_number="123456789",
            gcp_project_id="valid-project",
            dataset_name=malicious_dataset,
        )
    assert "dataset_name" in str(exc_info.value)


@pytest.mark.parametrize(
    "malicious_project_id",
    [
        "project` UNION ALL SELECT 1 --",
        "project; DROP TABLE routes;",
        "project name",
        "project'--",
        "project.dataset",
        "`gcp_project`",
        "valid_project\n",
        "-leading-hyphen",
        "_leading_underscore",
        "pröject-unicode",
        "",
        "p" * 1025,
    ],
)
def test_sync_request_rejects_malicious_or_invalid_gcp_project_id(malicious_project_id):
    with pytest.raises(ValidationError) as exc_info:
        SyncToBigQueryRequest(
            db_project_id=1,
            project_number="123456789",
            gcp_project_id=malicious_project_id,
            dataset_name="valid_dataset",
        )
    assert "gcp_project_id" in str(exc_info.value)


# =====================================================================
# 2. Defense-in-Depth Identifier Validator Helper Tests
# =====================================================================

def test_validate_bigquery_identifier_and_specific_helpers_success():
    assert validate_bigquery_dataset_id("roads_data_2026") == "roads_data_2026"
    assert validate_gcp_project_id("my-project-123") == "my-project-123"
    assert validate_bigquery_identifier("roads_data") == "roads_data"
    assert validate_bigquery_identifier("my-project-123") == "my-project-123"


@pytest.mark.parametrize(
    "invalid_dataset",
    [
        "",
        None,
        "dataset-with-hyphen",
        "valid_dataset\n",
        "dataset.with.dot",
        "dataset`inject",
        "dataset;select",
        "dataset--comment",
        "dataset'quote",
        'dataset"dquote',
        "dataset with spaces",
        "dataset\\escape",
        "dätaset",
        "a" * 1025,
    ],
)
def test_validate_bigquery_dataset_id_failure(invalid_dataset):
    with pytest.raises(HTTPException) as exc_info:
        validate_bigquery_dataset_id(invalid_dataset, "dataset_name")
    assert exc_info.value.status_code == 400
    assert "Invalid dataset_name" in exc_info.value.detail

    with pytest.raises(HTTPException) as exc_info_compat:
        validate_bigquery_identifier(invalid_dataset, "dataset_name")
    assert exc_info_compat.value.status_code == 400
    assert "Invalid dataset_name" in exc_info_compat.value.detail


@pytest.mark.parametrize(
    "invalid_project",
    [
        "",
        None,
        "valid_project\n",
        "-leading-hyphen",
        "project.with.dot",
        "project`inject",
        "project#comment",
        "project/*comment*/",
        "project`--comment",
        "project with spaces",
        "pröject",
        "p" * 1025,
    ],
)
def test_validate_gcp_project_id_failure(invalid_project):
    with pytest.raises(HTTPException) as exc_info:
        validate_gcp_project_id(invalid_project, "gcp_project_id")
    assert exc_info.value.status_code == 400
    assert "Invalid gcp_project_id" in exc_info.value.detail


# =====================================================================
# 3. Static SQL & QueryJobConfig Verification in perform_bq_sync
# =====================================================================

def test_static_bq_sync_query_has_zero_interpolation_markers():
    assert "FROM `routes_status`" in _BQ_SYNC_QUERY
    assert "FROM `recent_roads_data` r" in _BQ_SYNC_QUERY
    assert "{" not in _BQ_SYNC_QUERY
    assert "}" not in _BQ_SYNC_QUERY
    assert "%s" not in _BQ_SYNC_QUERY


@pytest.mark.asyncio
async def test_perform_bq_sync_uses_static_query_and_default_dataset_job_config(monkeypatch):
    captured = {}

    class FakeQueryJob:
        def result(self):
            return []

    class FakeBQClient:
        def __init__(self, project=None):
            captured["client_project"] = project

        def query(self, sql, job_config=None):
            captured["sql"] = sql
            captured["job_config"] = job_config
            return FakeQueryJob()

    monkeypatch.setattr("server.utils.sync_routes.bigquery.Client", FakeBQClient)

    result = await perform_bq_sync("my-gcp-project-123", 42, "historical_roads_data")

    assert result == {"updated": 0, "missing": 0}
    assert captured["client_project"] == "my-gcp-project-123"
    assert captured["sql"] is _BQ_SYNC_QUERY
    assert isinstance(captured["job_config"], bigquery.QueryJobConfig)
    assert captured["job_config"].default_dataset == bigquery.DatasetReference(
        "my-gcp-project-123", "historical_roads_data"
    )


@pytest.mark.asyncio
async def test_perform_bq_sync_rejects_invalid_identifiers():
    for bad_dataset in ("invalid`dataset", "dataset-with-hyphen", "valid_dataset\n", "proj.dataset"):
        with pytest.raises(HTTPException) as exc_info:
            await perform_bq_sync("valid-project", 1, bad_dataset)
        assert exc_info.value.status_code == 400
        assert "Invalid dataset_name" in exc_info.value.detail

    for bad_project in ("invalid`project", "valid_project\n", "proj.dataset"):
        with pytest.raises(HTTPException) as exc_info2:
            await perform_bq_sync(bad_project, 1, "valid_dataset")
        assert exc_info2.value.status_code == 400
        assert "Invalid gcp_project_id" in exc_info2.value.detail


@pytest.mark.asyncio
async def test_perform_bq_sync_sanitizes_sql_error_messages(monkeypatch):
    """
    Ensure that when BigQuery execution fails, raw database exception details
    (e.g., SQL syntax errors or schema information) are NOT leaked in the HTTP 502 response.
    """
    class FakeBQClient:
        def __init__(self, project=None):
            pass

    async def fake_run_bq_query(client, sql, job_config=None):
        raise RuntimeError("Syntax error: Unexpected string literal 'routes_status' at [4:20]")

    monkeypatch.setattr("server.utils.sync_routes.bigquery.Client", FakeBQClient)
    monkeypatch.setattr("server.utils.sync_routes.run_bq_query", fake_run_bq_query)

    with pytest.raises(HTTPException) as exc_info:
        await perform_bq_sync("test-project", 1, "test_dataset")

    assert exc_info.value.status_code == 502
    assert exc_info.value.detail == "BigQuery sync failed. Check server logs for details."
    assert "Syntax error" not in exc_info.value.detail
    assert "routes_status" not in exc_info.value.detail


# =====================================================================
# 4. execute_sync DB Project Cross-Check & Error Sanitization Tests
# =====================================================================

@pytest.mark.asyncio
async def test_execute_sync_validates_identifiers_before_db():
    with pytest.raises(HTTPException) as exc_info:
        await execute_sync(
            db_project_id=1,
            project_number="123456",
            gcp_project_id="valid-project",
            dataset_name="attack`inject",
        )
    assert exc_info.value.status_code == 400
    assert "Invalid dataset_name" in exc_info.value.detail


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "override_kwargs,expected_field",
    [
        ({"gcp_project_id": "other-gcp-project"}, "gcp_project_id"),
        ({"project_number": "999999999"}, "project_number"),
        ({"dataset_name": "other_dataset"}, "dataset_name"),
    ],
)
async def test_execute_sync_rejects_mismatched_stored_project_config(
    monkeypatch, override_kwargs, expected_field
):
    async def fake_get_project_sync_config(db_project_id: int):
        return {
            "project_uuid": "proj-uuid-123",
            "google_cloud_project_id": "expected-gcp-proj",
            "google_cloud_project_number": "123456789",
            "dataset_name": "expected_dataset",
        }

    monkeypatch.setattr(
        "server.utils.sync_routes.get_project_sync_config", fake_get_project_sync_config
    )

    call_kwargs = {
        "db_project_id": 7,
        "project_number": "123456789",
        "gcp_project_id": "expected-gcp-proj",
        "dataset_name": "expected_dataset",
    }
    call_kwargs.update(override_kwargs)

    with pytest.raises(HTTPException) as exc_info:
        await execute_sync(**call_kwargs)

    assert exc_info.value.status_code == 400
    assert expected_field in exc_info.value.detail
    # Client-safe error message must NOT echo raw caller-supplied values
    for val in override_kwargs.values():
        assert str(val) not in exc_info.value.detail


@pytest.mark.asyncio
async def test_execute_sync_allows_matching_stored_project_config_single_route(monkeypatch):
    async def fake_get_project_sync_config(db_project_id: int):
        return {
            "project_uuid": "proj-uuid-123",
            "google_cloud_project_id": "expected-gcp-proj",
            "google_cloud_project_number": "123456789",
            "dataset_name": "expected_dataset",
        }

    async def fake_fetch_single_route(project_uuid: str, route_uuid: str):
        return None

    monkeypatch.setattr(
        "server.utils.sync_routes.get_project_sync_config", fake_get_project_sync_config
    )
    monkeypatch.setattr(
        "server.utils.sync_routes.fetch_single_route", fake_fetch_single_route
    )

    res = await execute_sync(
        db_project_id=7,
        project_number="123456789",
        gcp_project_id="expected-gcp-proj",
        dataset_name="expected_dataset",
        uuid="missing-route-uuid",
    )
    assert res == {"status": "error", "message": "Route not found."}


@pytest.mark.asyncio
async def test_execute_sync_sanitizes_route_list_error(monkeypatch):
    async def fake_get_project_sync_config(db_project_id: int):
        return {
            "project_uuid": "proj-uuid-123",
            "google_cloud_project_id": "expected-gcp-proj",
            "google_cloud_project_number": "123456789",
            "dataset_name": "expected_dataset",
        }

    async def fake_fetch_routes(*args, **kwargs):
        return []

    async def fake_list_routes(*args, **kwargs):
        raise RouteListError(
            status_code=502,
            message="Upstream IAM token leak: ya29.secret_internal_detail_xyz",
        )

    async def fake_perform_bq_sync(*args, **kwargs):
        return []

    monkeypatch.setattr(
        "server.utils.sync_routes.get_project_sync_config", fake_get_project_sync_config
    )
    monkeypatch.setattr(
        "server.utils.sync_routes.fetch_all_project_routes_by_project_id",
        fake_fetch_routes,
    )
    monkeypatch.setattr(
        "server.utils.sync_routes.fetch_all_project_routes", fake_fetch_routes
    )
    monkeypatch.setattr("server.utils.sync_routes.list_routes", fake_list_routes)
    monkeypatch.setattr("server.utils.sync_routes.perform_bq_sync", fake_perform_bq_sync)

    with pytest.raises(HTTPException) as exc_info:
        await execute_sync(
            db_project_id=7,
            project_number="123456789",
            gcp_project_id="expected-gcp-proj",
            dataset_name="expected_dataset",
        )

    assert exc_info.value.status_code == 502
    assert (
        exc_info.value.detail
        == "Failed to fetch routes from Roads API. Check server logs for details."
    )
    assert "ya29" not in exc_info.value.detail
    assert "secret_internal_detail_xyz" not in exc_info.value.detail


@pytest.mark.asyncio
async def test_execute_sync_sanitizes_unexpected_parallel_fetch_error(monkeypatch):
    async def fake_get_project_sync_config(db_project_id: int):
        return {
            "project_uuid": "proj-uuid-123",
            "google_cloud_project_id": "expected-gcp-proj",
            "google_cloud_project_number": "123456789",
            "dataset_name": "expected_dataset",
        }

    async def fake_fetch_routes(*args, **kwargs):
        raise RuntimeError("sqlite3.OperationalError: secret_internal_table_path /var/db")

    async def fake_list_routes(*args, **kwargs):
        return []

    async def fake_perform_bq_sync(*args, **kwargs):
        return []

    monkeypatch.setattr(
        "server.utils.sync_routes.get_project_sync_config", fake_get_project_sync_config
    )
    monkeypatch.setattr(
        "server.utils.sync_routes.fetch_all_project_routes_by_project_id",
        fake_fetch_routes,
    )
    monkeypatch.setattr(
        "server.utils.sync_routes.fetch_all_project_routes", fake_fetch_routes
    )
    monkeypatch.setattr("server.utils.sync_routes.list_routes", fake_list_routes)
    monkeypatch.setattr("server.utils.sync_routes.perform_bq_sync", fake_perform_bq_sync)

    with pytest.raises(HTTPException) as exc_info:
        await execute_sync(
            db_project_id=7,
            project_number="123456789",
            gcp_project_id="expected-gcp-proj",
            dataset_name="expected_dataset",
        )

    assert exc_info.value.status_code == 502
    assert (
        exc_info.value.detail
        == "Sync initialization failed. Check server logs for details."
    )
    assert "sqlite3.OperationalError" not in exc_info.value.detail
    assert "secret_internal_table_path" not in exc_info.value.detail


# =====================================================================
# 5. Project Creation, Update & Import Models Validation Tests
# =====================================================================

@pytest.mark.parametrize(
    "bad_dataset",
    [
        "invalid`dataset",
        "dataset-with-hyphen",
        "valid_dataset\n",
        "proj.dataset",
        "dätaset",
        "",
        "a" * 1025,
    ],
)
def test_project_models_reject_invalid_dataset_name(bad_dataset):
    with pytest.raises(ValidationError):
        ProjectCreate(
            project_name="Test",
            jurisdiction_boundary_geojson="{}",
            dataset_name=bad_dataset,
        )

    with pytest.raises(ValidationError):
        ProjectUpdate(
            dataset_name=bad_dataset,
        )

    with pytest.raises(ValidationError):
        ProjectFormatAndCreate(
            project_name="Test",
            dataset_name=bad_dataset,
        )


@pytest.mark.parametrize(
    "bad_dataset",
    [
        "invalid`dataset",
        "dataset-with-hyphen",
        "valid_dataset\n",
        "proj.dataset",
    ],
)
@pytest.mark.asyncio
async def test_import_project_from_zip_rejects_invalid_dataset_name(bad_dataset):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr(
            "export.json",
            json.dumps(
                {
                    "project": {
                        "project_name": "Imported",
                        "google_cloud_project_id": "gcp-1",
                        "dataset_name": bad_dataset,
                        "jurisdiction_boundary_geojson": "{}",
                        "viewstate": "{}",
                    },
                    "routes": [],
                }
            ),
        )

    with pytest.raises(ValueError, match="Invalid dataset_name"):
        await import_project_from_zip(buf.getvalue(), session_id=str(uuid.uuid4()))
