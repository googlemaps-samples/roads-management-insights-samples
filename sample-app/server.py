# Copyright 2025 Google LLC
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



from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, FileResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator, model_validator
from typing import List, Optional
from datetime import datetime
import os
import gzip
import re
import logging
from pathlib import Path
from brotli_asgi import BrotliMiddleware

logger = logging.getLogger(__name__)

from backend.fetch_data import (
    fetch_latest_historical_data,
    fetch_hourly_aggregated_data,
    fetch_city_details,
    fetch_route_metrics,
    fetch_average_travel_time_by_hour,
)
from backend.env_manager import create_ui_env_file

# read .env file in os environment
load_dotenv()


application_mode = os.getenv("APPLICATION_MODE", "demo")
google_maps_api_key = os.getenv("GOOGLE_API_KEY", "")
print(f"Application Mode: {application_mode}")
print(f"Google Maps API Key: {'Set' if google_maps_api_key else 'Not set'}")

# Create the .env file on startup
create_ui_env_file(google_maps_api_key, application_mode)

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

app.add_middleware(BrotliMiddleware, quality=5, minimum_size=1000)

if Path("ui/dist/assets").exists():
    app.mount("/assets", StaticFiles(directory="ui/dist/assets"), name="assets")


CITY_NAME_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")


def validate_city_name(city_name: str) -> str:
    if not city_name or not CITY_NAME_PATTERN.match(city_name):
        raise HTTPException(status_code=400, detail="Invalid city_name format")
    return city_name.upper()


class RouteDataRequest(BaseModel):
    display_names: List[str] = Field(default_factory=list)
    from_date: str = Field(..., description="Start date in YYYY-MM-DD format", pattern=r"^\d{4}-\d{2}-\d{2}$")
    to_date: str = Field(..., description="End date in YYYY-MM-DD format", pattern=r"^\d{4}-\d{2}-\d{2}$")
    weekdays: List[int] = Field(..., description="List of weekdays (1=Sunday, 7=Saturday)", min_length=1)

    @field_validator("from_date", "to_date")
    @classmethod
    def validate_date(cls, v: str) -> str:
        try:
            datetime.strptime(v, "%Y-%m-%d")
        except ValueError:
            raise ValueError("Date must be a valid calendar date in YYYY-MM-DD format")
        return v

    @field_validator("weekdays")
    @classmethod
    def validate_weekdays(cls, v: List[int]) -> List[int]:
        if not v:
            raise ValueError("weekdays list cannot be empty")
        for day in v:
            if not isinstance(day, int) or day < 1 or day > 7:
                raise ValueError("Each weekday must be an integer between 1 (Sunday) and 7 (Saturday)")
        return v

    @field_validator("display_names")
    @classmethod
    def validate_display_names(cls, v: List[str]) -> List[str]:
        for name in v:
            if not isinstance(name, str) or len(name) > 256:
                raise ValueError("Each display name must be a string with maximum length of 256 characters")
        return v

    @model_validator(mode="after")
    def validate_date_range(self) -> "RouteDataRequest":
        if self.from_date > self.to_date:
            raise ValueError("from_date cannot be after to_date")
        return self


@app.get("/api/latest/{city_name}")
async def get_latest_historical_data(city_name: str):
    city_name = validate_city_name(city_name)
    geojson_data = fetch_latest_historical_data(city_name)

    if not geojson_data:
        raise HTTPException(status_code=500, detail="Error fetching latest data")

    return geojson_data


@app.post("/api/historical/{city_name}")
async def get_hourly_aggregated_data(city_name: str, body: RouteDataRequest):
    city_name = validate_city_name(city_name)
    try:
        aggregated_data = fetch_hourly_aggregated_data(
            city_name, body.display_names, body.from_date, body.to_date, body.weekdays
        )

        if not aggregated_data:
            raise HTTPException(status_code=500, detail="Error fetching data")

        return aggregated_data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching historical data for {city_name}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error fetching data")


@app.post("/api/route-metrics/{city_name}")
async def get_route_metrics(city_name: str, body: RouteDataRequest):
    """
    API endpoint to calculate route metrics including:
    - Planning Time Index (PTI)
    - Travel Time Index (TTI)
    - Average Travel Time
    - Free Flow Time
    - 95th Percentile Travel Time

    Request body:
    {
        "display_names": ["route1", "route2"],  // Optional, empty for all routes
        "from_date": "2024-01-01",
        "to_date": "2024-01-31",
        "weekdays": [1, 2, 3, 4, 5]  // 1=Sunday, 7=Saturday
    }
    """
    city_name = validate_city_name(city_name)
    try:
        route_metrics = fetch_route_metrics(
            city_name, body.display_names, body.from_date, body.to_date, body.weekdays
        )

        if route_metrics is None:
            raise HTTPException(
                status_code=500, detail="Error calculating route metrics"
            )

        return route_metrics
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error calculating route metrics for {city_name}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error calculating route metrics")


@app.post("/api/average-travel-time-by-hour/{city_name}")
async def get_average_travel_time_by_hour(city_name: str, body: RouteDataRequest):
    """
    API endpoint to calculate average travel time by hour for all routes or specific routes.
    Similar to calculateAverageTravelTimeByHour in TypeScript.

    Request body:
    {
        "display_names": ["route1", "route2"],  // Optional, empty for all routes
        "from_date": "2024-01-01",
        "to_date": "2024-01-31",
        "weekdays": [1, 2, 3, 4, 5]  // 1=Sunday, 7=Saturday
    }

    Returns:
    {
        "routeHourlyAverages": {
            "route_id_1": {0: 120.5, 1: 125.3, ...},
            "route_id_2": {0: 180.2, 1: 185.7, ...}
        },
        "hourlyTotalAverages": {
            0: {"totalDuration": 3000.5, "count": 150},
            1: {"totalDuration": 3100.2, "count": 155},
            ...
        }
    }
    """
    city_name = validate_city_name(city_name)
    try:
        average_travel_time_data = fetch_average_travel_time_by_hour(
            city_name, body.display_names, body.from_date, body.to_date, body.weekdays
        )

        if average_travel_time_data is None:
            raise HTTPException(
                status_code=500, detail="Error calculating average travel time by hour"
            )

        return average_travel_time_data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error calculating average travel time by hour for {city_name}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error calculating average travel time by hour")


@app.get("/api/data/{file_path:path}")
async def get_data_file(file_path: str):
    """
    API endpoint to serve files from data directory.
    Automatically decompresses .gz files if they exist, or serves uncompressed files.
    """
    # Construct the full path to the file
    file_full_path = Path("data") / file_path
    compressed_file_path = Path("data") / f"{file_path}.gz"

    # Security check: ensure the path is within data directory
    try:
        file_full_path = file_full_path.resolve()
        compressed_file_path = compressed_file_path.resolve()
        data_path = Path("data").resolve()
        # Ensure paths are within data_path
        file_full_path.relative_to(data_path)
        compressed_file_path.relative_to(data_path)
    except (ValueError, RuntimeError):
        raise HTTPException(status_code=400, detail="Invalid file path")

    # Determine media type based on file extension
    media_type = "application/json" if file_path.endswith('.json') else "text/csv" if file_path.endswith('.csv') else "application/octet-stream"

    # Check if compressed version exists first
    if compressed_file_path.exists() and compressed_file_path.is_file():
        try:
            # Decompress and serve the file
            with gzip.open(compressed_file_path, 'rb') as f:
                content = f.read()
            
            return Response(
                content=content,
                media_type=media_type,
                headers={
                    "Content-Disposition": f'inline; filename="{file_full_path.name}"',
                    "Cache-Control": "public, max-age=3600"
                }
            )
        except Exception as e:
            logger.error(f"Error decompressing file {file_path}: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Error decompressing file")
    
    # Fall back to uncompressed file if it exists
    elif file_full_path.exists() and file_full_path.is_file():
        return FileResponse(
            path=str(file_full_path),
            filename=file_full_path.name,
            media_type=media_type,
        )
    
    else:
        raise HTTPException(status_code=404, detail="File not found")


@app.get("/api/cities/metadata")
async def get_city_metadata():
    city_metadata = fetch_city_details()

    if not city_metadata:
        raise HTTPException(status_code=500, detail="Error fetching city metadata")

    return city_metadata


@app.get("/{full_path:path}", response_class=HTMLResponse)
async def serve_react_app(full_path: str):
    html = open("ui/dist/index.html", "r").read()
    if not application_mode == "demo":
        html = html.replace('window.DEMO_MODE = "true"', 'window.DEMO_MODE = "false"')
    
    # Replace Google Maps API key using regex to handle all cases
    if google_maps_api_key:
        # Replace any existing key with our API key
        # Pattern matches ?key=anything& or ?key=anything followed by end of string or space
        html = re.sub(r'(\?key=)[^&\s"]*', rf'\g<1>{google_maps_api_key}', html)
    else:
        # Remove the key parameter entirely if no API key is provided
        # Handle ?key=value& (key is first parameter)
        html = re.sub(r'\?key=[^&\s"]*&', '?', html)
        # Handle &key=value (key is not first parameter)
        html = re.sub(r'&key=[^&\s"]*', '', html)
        # Handle ?key=value (key is only parameter)
        html = re.sub(r'\?key=[^&\s"]*', '', html)
    
    return html
