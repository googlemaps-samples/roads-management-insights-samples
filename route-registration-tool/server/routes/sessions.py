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

from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from server.db.common import query_db

router = APIRouter(prefix="/sessions", tags=["Sessions"])


def _validate_session_id(session_id: str) -> str:
    try:
        return str(uuid.UUID(str(session_id)))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session_id (expected UUID).")


class LinkSessionRequest(BaseModel):
    other_session_id: str = Field(..., description="Session ID to link (UUID).")


class LinkedSessionsResponse(BaseModel):
    session_id: str
    linked_session_ids: list[str]


@router.get("/{session_id}")
async def get_session(session_id: str):
    """Return session if it exists; 404 otherwise."""
    sid = _validate_session_id(session_id)
    rows = await query_db("SELECT id FROM sessions WHERE id = ?", (sid,))
    if not rows:
        raise HTTPException(status_code=404, detail="Session not found.")
    return {"success": True, "data": {"session_id": sid}}


@router.post("/{session_id}/ensure")
async def ensure_session(session_id: str):
    """Idempotently ensure a session row exists for session_id."""
    sid = _validate_session_id(session_id)
    await query_db(
        """
        INSERT INTO sessions (id)
        VALUES (?)
        ON CONFLICT(id) DO NOTHING
        """,
        (sid,),
        commit=True,
    )
    return {"success": True, "data": {"session_id": sid}}


@router.get("/{session_id}/linked", response_model=LinkedSessionsResponse)
async def get_linked_sessions(session_id: str):
    sid = _validate_session_id(session_id)
    rows = await query_db(
        """
        SELECT linked_session_id
        FROM session_links
        WHERE session_id = ?
        ORDER BY linked_session_id ASC
        """,
        (sid,),
    )
    linked = [r["linked_session_id"] for r in rows]
    return LinkedSessionsResponse(session_id=sid, linked_session_ids=linked)


@router.post("/{session_id}/link")
async def link_session(session_id: str, body: LinkSessionRequest):
    """Link two sessions (symmetric; inserts both directions)."""
    sid = _validate_session_id(session_id)
    other = _validate_session_id(body.other_session_id)
    if sid == other:
        raise HTTPException(status_code=400, detail="Cannot link a session to itself.")

    # Ensure the current session exists (idempotent).
    await query_db(
        "INSERT INTO sessions (id) VALUES (?) ON CONFLICT(id) DO NOTHING",
        (sid,),
        commit=True,
    )

    # Do NOT auto-create the other session. This prevents typos from silently
    # creating empty sessions and makes linking a deliberate action.
    other_rows = await query_db("SELECT id FROM sessions WHERE id = ?", (other,))
    if not other_rows:
        raise HTTPException(status_code=404, detail="Session not found.")

    existing = await query_db(
        """
        SELECT 1
        FROM session_links
        WHERE session_id = ? AND linked_session_id = ?
        """,
        (sid, other),
    )
    if existing:
        raise HTTPException(status_code=409, detail="Session already linked.")

    await query_db(
        """
        INSERT INTO session_links (session_id, linked_session_id)
        VALUES (?, ?)
        ON CONFLICT(session_id, linked_session_id) DO NOTHING
        """,
        (sid, other),
        commit=True,
    )
    await query_db(
        """
        INSERT INTO session_links (session_id, linked_session_id)
        VALUES (?, ?)
        ON CONFLICT(session_id, linked_session_id) DO NOTHING
        """,
        (other, sid),
        commit=True,
    )
    return {"success": True}


@router.delete("/{session_id}/link/{other_session_id}")
async def unlink_session(session_id: str, other_session_id: str):
    sid = _validate_session_id(session_id)
    other = _validate_session_id(other_session_id)

    await query_db(
        "DELETE FROM session_links WHERE session_id = ? AND linked_session_id = ?",
        (sid, other),
        commit=True,
    )
    await query_db(
        "DELETE FROM session_links WHERE session_id = ? AND linked_session_id = ?",
        (other, sid),
        commit=True,
    )
    return {"success": True}

