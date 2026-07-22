# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.

"""Sync and async SQLAlchemy engines (shared async engine with ``server.db.common``)."""

from sqlalchemy import create_engine

from server.db.common import get_database_urls
import server.db.common as _db

_, sync_url = get_database_urls()
engine = create_engine(sync_url, pool_pre_ping=True)

# Single async engine for the app (see ``server.db.common``)
async_engine = _db.async_engine
