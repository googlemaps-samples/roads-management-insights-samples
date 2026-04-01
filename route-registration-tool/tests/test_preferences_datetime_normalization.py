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

import datetime

import pytest

from server.routes.users import row_to_preferences_out


def test_row_to_preferences_out_normalizes_datetime_to_isoformat():
    row = {
        "id": 1,
        "distance_unit": "km",
        "google_cloud_account": None,
        "show_tooltip": 1,
        "show_instructions": 0,
        "route_color_mode": "sync_status",
        "created_at": datetime.datetime(2026, 3, 30, 10, 2, 10, 828686),
        "updated_at": datetime.datetime(2026, 3, 30, 10, 2, 10, 828686),
    }

    out = row_to_preferences_out(row)

    assert out.created_at == row["created_at"].isoformat()
    assert out.updated_at == row["updated_at"].isoformat()

