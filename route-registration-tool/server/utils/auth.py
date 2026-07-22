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


from google.auth import default
from google.auth.transport.requests import Request
from google.auth.exceptions import DefaultCredentialsError
import asyncio

_SCOPES = ["https://www.googleapis.com/auth/cloud-platform"]


def _load_credentials():
    try:
        return default(scopes=_SCOPES)
    except DefaultCredentialsError as e:
        raise RuntimeError(f"Failed to get default credentials: {e}")


def get_adc_project_id():
    """Return the GCP project ID tied to the ADC principal.

    This is the same project used by `ProjectsClient()` for
    `/gcp-projects-list` and is what backend Google Maps Platform calls bill
    quota to via `X-Goog-User-Project`.
    """
    _, project_id = _load_credentials()
    if not project_id:
        raise RuntimeError(
            "Application Default Credentials returned no project ID. Set one "
            "with `gcloud config set project <PROJECT_ID>` or run on a Cloud "
            "Run service whose service account has a home project."
        )
    return project_id


def get_oauth_token_sync():
    credentials, _ = _load_credentials()
    credentials.refresh(Request())
    return credentials.token


async def get_oauth_token():
    credentials, _ = _load_credentials()
    await asyncio.to_thread(credentials.refresh, Request())
    return credentials.token