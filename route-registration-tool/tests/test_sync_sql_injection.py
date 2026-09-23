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

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from server.routes.sync import SyncToBigQueryRequest
from server.routes.projects import ProjectCreate, ProjectUpdate, ProjectFormatAndCreate
from server.utils.sync_routes import (
    validate_bigquery_identifier,
    perform_bq_sync,
    execute_sync,
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


def test_sync_request_valid_dataset_with_hyphens_and_underscores():
    req = SyncToBigQueryRequest(
        db_project_id=1,
        project_number="123456789",
        gcp_project_id="test-proj_1",
        dataset_name="dataset_roads-2026",
    )
    assert req.dataset_name == "dataset_roads-2026"


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
        "dataset/path",
        "dataset..nested",
        "`dataset`",
    ],
)
def test_sync_request_rejects_malicious_dataset_name(malicious_dataset):
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
    ],
)
def test_sync_request_rejects_malicious_gcp_project_id(malicious_project_id):
    with pytest.raises(ValidationError) as exc_info:
        SyncToBigQueryRequest(
            db_project_id=1,
            project_number="123456789",
            gcp_project_id=malicious_project_id,
            dataset_name="valid_dataset",
        )
    assert "gcp_project_id" in str(exc_info.value)


# =====================================================================
# 2. Defense-in-depth validate_bigquery_identifier Helper Tests
# =====================================================================

def test_validate_bigquery_identifier_success():
    assert validate_bigquery_identifier("roads_data") == "roads_data"
    assert validate_bigquery_identifier("my-project-123") == "my-project-123"


@pytest.mark.parametrize(
    "invalid_id",
    [
        "",
        None,
        "dataset.with.dot",
        "dataset`inject",
        "dataset;select",
        "dataset with spaces",
        "dataset\\escape",
    ],
)
def test_validate_bigquery_identifier_failure(invalid_id):
    with pytest.raises(HTTPException) as exc_info:
        validate_bigquery_identifier(invalid_id, "dataset_name")
    assert exc_info.value.status_code == 400
    assert "Invalid dataset_name" in exc_info.value.detail


# =====================================================================
# 3. Logic Layer perform_bq_sync & execute_sync Defense Tests
# =====================================================================

@pytest.mark.asyncio
async def test_perform_bq_sync_rejects_invalid_identifiers():
    with pytest.raises(HTTPException) as exc_info:
        await perform_bq_sync("valid-project", 1, "invalid`dataset")
    assert exc_info.value.status_code == 400
    assert "Invalid dataset_name" in exc_info.value.detail

    with pytest.raises(HTTPException) as exc_info2:
        await perform_bq_sync("invalid`project", 1, "valid_dataset")
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

    async def fake_run_bq_query(client, sql):
        raise RuntimeError("Syntax error: Unexpected string literal 'routes_status' at [4:20]")

    monkeypatch.setattr("server.utils.sync_routes.bigquery.Client", FakeBQClient)
    monkeypatch.setattr("server.utils.sync_routes.run_bq_query", fake_run_bq_query)

    with pytest.raises(HTTPException) as exc_info:
        await perform_bq_sync("test-project", 1, "test_dataset")

    assert exc_info.value.status_code == 502
    # The detail message MUST be generic and NOT expose the underlying SQL syntax error:
    assert exc_info.value.detail == "BigQuery sync failed. Check server logs for details."
    assert "Syntax error" not in exc_info.value.detail
    assert "routes_status" not in exc_info.value.detail


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


# =====================================================================
# 4. Project Creation & Update Models Validation Tests
# =====================================================================

def test_project_create_rejects_malicious_dataset_name():
    with pytest.raises(ValidationError):
        ProjectCreate(
            project_name="Test",
            jurisdiction_boundary_geojson="{}",
            dataset_name="invalid`dataset",
        )


def test_project_update_rejects_malicious_dataset_name():
    with pytest.raises(ValidationError):
        ProjectUpdate(
            dataset_name="invalid`dataset",
        )


def test_project_format_and_create_rejects_malicious_dataset_name():
    with pytest.raises(ValidationError):
        ProjectFormatAndCreate(
            project_name="Test",
            dataset_name="invalid`dataset",
        )
