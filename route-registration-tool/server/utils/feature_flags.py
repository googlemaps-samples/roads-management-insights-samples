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


def _env_int(name: str, default: int, min_value: int, max_value: int) -> int:
    raw = os.getenv(name, str(default)).strip()
    try:
        parsed = int(raw)
    except (TypeError, ValueError):
        return default
    return max(min_value, min(max_value, parsed))


#
# Create-project wizard step configuration
# --------------------------------------
# Configure which steps to SKIP in the UI.
#
# NEW_PROJECT_CREATION_SKIP_STEPS accepts a comma-separated list of 1-based step
# numbers to skip: 1,2,4 (Step 3 is always shown and cannot be skipped).
#
# Steps (1-based):
#  1 = Google Cloud Project
#  2 = Dataset Name
#  3 = Project Name (always shown)
#  4 = Jurisdiction Boundary
#
# Internally, the UI uses 0-based indices in the original order: [0,1,2,3].
NEW_PROJECT_CREATION_SKIP_STEPS_RAW = os.getenv(
    "NEW_PROJECT_CREATION_SKIP_STEPS", ""
).strip()

NEW_PROJECT_CREATION_SKIP_STEPS: list[int] = []
if NEW_PROJECT_CREATION_SKIP_STEPS_RAW:
    for part in NEW_PROJECT_CREATION_SKIP_STEPS_RAW.split(","):
        p = part.strip()
        if not p:
            continue
        try:
            step_num = int(p)
        except ValueError:
            continue
        # Only steps 1,2,4 are skippable. Step 3 is always shown.
        if step_num in (1, 2, 4):
            NEW_PROJECT_CREATION_SKIP_STEPS.append(step_num)
NEW_PROJECT_CREATION_SKIP_STEPS = sorted(set(NEW_PROJECT_CREATION_SKIP_STEPS))

# Step indices to SHOW in the UI (0-based: 0..3).
_skip_indices = {
    0 if 1 in NEW_PROJECT_CREATION_SKIP_STEPS else None,
    1 if 2 in NEW_PROJECT_CREATION_SKIP_STEPS else None,
    3 if 4 in NEW_PROJECT_CREATION_SKIP_STEPS else None,
}
_skip_indices.discard(None)

NEW_PROJECT_CREATION_STEP_INDICES = [i for i in (0, 1, 2, 3) if i not in _skip_indices]
# Ensure Step 3 (Project Name, index 2) is always present.
if 2 not in NEW_PROJECT_CREATION_STEP_INDICES:
    NEW_PROJECT_CREATION_STEP_INDICES.append(2)
NEW_PROJECT_CREATION_STEP_INDICES = sorted(set(NEW_PROJECT_CREATION_STEP_INDICES))

NEW_PROJECT_CREATION_STEPS = len(NEW_PROJECT_CREATION_STEP_INDICES)
