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

"""
Feature flags read from environment.
ENABLE_MULTITENANT: when True, one GCP project can be used by multiple app projects
(project_uuid scopes routes in API). When False (default), one GCP project = one app project.
"""
import os

from dotenv import load_dotenv
# Load .env from route-registration-tool root so flags are set before use
_load_dotenv_path = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    ".env",
)
load_dotenv(_load_dotenv_path)


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name, "false" if default is False else "true").strip().lower()
    return raw in ("true", "1", "yes")

ENABLE_MULTITENANT = _env_bool("ENABLE_MULTITENANT", False)
