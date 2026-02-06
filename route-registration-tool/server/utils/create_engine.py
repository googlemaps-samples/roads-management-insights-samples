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


import os
from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import create_async_engine
DB_PATH = "my_database.db"

engine = create_engine(f"sqlite:///{os.path.abspath(DB_PATH)}", pool_pre_ping=True)
async_engine = create_async_engine(f"sqlite+aiosqlite:///{os.path.abspath(DB_PATH)}", pool_pre_ping=True)