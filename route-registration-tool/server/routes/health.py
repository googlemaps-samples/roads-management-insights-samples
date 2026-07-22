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

import asyncio
import logging
import time
from typing import Any, Awaitable, Callable, Dict

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from server.db.common import async_engine

logger = logging.getLogger("health")

router = APIRouter(prefix="/health", tags=["Health"])

CHECK_TIMEOUT_SECONDS = 2.0


async def _timed(
    name: str, fn: Callable[[], Awaitable[None]]
) -> Dict[str, Any]:
    """Run a check coroutine with a per-check timeout and uniform result shape."""
    start = time.perf_counter()
    try:
        await asyncio.wait_for(fn(), timeout=CHECK_TIMEOUT_SECONDS)
    except asyncio.TimeoutError:
        return {
            "status": "fail",
            "error": f"timeout after {int(CHECK_TIMEOUT_SECONDS * 1000)}ms",
        }
    except Exception as e:
        return {"status": "fail", "error": type(e).__name__}

    return {
        "status": "ok",
        "latency_ms": int((time.perf_counter() - start) * 1000),
    }


async def _check_database() -> Dict[str, Any]:
    """Run SELECT 1 against the shared async engine pool."""

    async def _ping() -> None:
        async with async_engine.connect() as conn:
            await conn.execute(text("SELECT 1"))

    return await _timed("database", _ping)


async def _check_roads_api() -> Dict[str, Any]:
    """
    Verify ADC can mint an OAuth token. This is the prerequisite for every
    backend Roads API call; if it fails the service cannot serve Roads-API-
    backed requests. Doesn't hit the Roads endpoint directly to avoid quota
    cost on a per-minute probe — Google's auth endpoint reachability is a
    reliable proxy.
    """
    from server.utils.auth import get_oauth_token

    async def _mint() -> None:
        await get_oauth_token()

    return await _timed("roads_api", _mint)


async def _check_bigquery() -> Dict[str, Any]:
    """
    Verify the BigQuery endpoint is reachable using the ADC home project.
    Uses list_datasets(max_results=1) — a metadata call with no query cost.
    """
    from google.cloud import bigquery
    from server.utils.auth import get_adc_project_id

    def _ping_sync() -> None:
        project = get_adc_project_id()
        client = bigquery.Client(project=project)
        # Iterating once forces the underlying HTTP request.
        iterator = client.list_datasets(max_results=1)
        next(iter(iterator), None)

    async def _ping() -> None:
        await asyncio.to_thread(_ping_sync)

    return await _timed("bigquery", _ping)


@router.get("/ready")
async def readiness():
    """
    Readiness probe used by Cloud Monitoring uptime checks.

    Returns 200 only when the service can serve real traffic. Must remain
    side-effect free — do not add writes, audit logging, counters, or auth.
    """
    db, roads, bq = await asyncio.gather(
        _check_database(),
        _check_roads_api(),
        _check_bigquery(),
    )
    checks = {"database": db, "roads_api": roads, "bigquery": bq}

    if all(c["status"] == "ok" for c in checks.values()):
        return JSONResponse(
            status_code=200,
            content={"status": "ok", "checks": checks},
        )

    failed = {name: c for name, c in checks.items() if c["status"] != "ok"}
    logger.warning("Readiness check failed: %s", failed)
    return JSONResponse(
        status_code=503,
        content={"status": "fail", "checks": checks},
    )


@router.get("/live")
async def liveness():
    """
    Liveness probe used by Cloud Run to decide whether to restart the
    container. Returns 200 unconditionally — the process is alive if it
    can answer this.
    """
    return JSONResponse(status_code=200, content={"status": "ok"})
