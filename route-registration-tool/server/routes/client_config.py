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

"""Public client configuration derived from server feature flags."""

from fastapi import APIRouter

from server.utils.feature_flags import (
    ENABLE_MULTITENANT,
    NEW_PROJECT_CREATION_STEP_INDICES,
    NEW_PROJECT_CREATION_STEPS,
    NEW_PROJECT_CREATION_SKIP_STEPS,
)

router = APIRouter(tags=["Client config"])


@router.get("/client-config")
async def get_client_config() -> dict:
    return {
        "enable_multitenant": ENABLE_MULTITENANT,
        "new_project_creation_steps": NEW_PROJECT_CREATION_STEPS,
        "new_project_creation_step_indices": NEW_PROJECT_CREATION_STEP_INDICES,
        "new_project_creation_skip_steps": NEW_PROJECT_CREATION_SKIP_STEPS,
    }
