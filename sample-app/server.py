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
import os
import gzip
import re
from pathlib import Path
from brotli_asgi import BrotliMiddleware

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

app.mount("/assets", StaticFiles(directory="ui/dist/assets"), name="assets")

@app.get("/api/latest/{city_name}")
async def get_latest_historical_data(city_name: str):
    city_name = city_name.upper()
    geojson_data = fetch_latest_historical_data(city_name)

    if not geojson_data:
        raise HTTPException(status_code=500, detail="Error fetching latest data")

    return geojson_data


@app.post("/api/historical/{city_name}")
async def get_hourly_aggregated_data(city_name: str, request: Request):
    try:
        body = await request.json()  # get JSON as dict

        display_names = body.get("display_names", [])
        from_date = body.get("from_date")
        to_date = body.get("to_date")
        weekdays = body.get("weekdays", [])

        city_name = city_name.upper()

        aggregated_data = fetch_hourly_aggregated_data(
            city_name, display_names, from_date, to_date, weekdays
        )

        if not aggregated_data:
            raise HTTPException(status_code=500, detail="Error fetching data")

        return aggregated_data
    except Exception as e:
        print(f"DEBUGGING ERROR: {e}")
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal Debugging Error: {e}")


@app.post("/api/route-metrics/{city_name}")
async def get_route_metrics(city_name: str, request: Request):
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
    try:
        body = await request.json()

        display_names = body.get("display_names", [])
        from_date = body.get("from_date")
        to_date = body.get("to_date")
        weekdays = body.get("weekdays", [])

        # Validate required parameters
        if not from_date or not to_date:
            raise HTTPException(
                status_code=400, detail="from_date and to_date are required"
            )

        if not weekdays:
            raise HTTPException(status_code=400, detail="weekdays list is required")

        city_name = city_name.upper()

        route_metrics = fetch_route_metrics(
            city_name, display_names, from_date, to_date, weekdays
        )

        if route_metrics is None:
            raise HTTPException(
                status_code=500, detail="Error calculating route metrics"
            )

        return route_metrics
    except HTTPException:
        raise
    except Exception as e:
        print(f"DEBUGGING ERROR: {e}")
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal Debugging Error: {e}")

@app.post("/api/average-travel-time-by-hour/{city_name}")
async def get_average_travel_time_by_hour(city_name: str, request: Request):
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
    try:
        body = await request.json()

        display_names = body.get("display_names", [])
        from_date = body.get("from_date")
        to_date = body.get("to_date")
        weekdays = body.get("weekdays", [])

        # Validate required parameters
        if not from_date or not to_date:
            raise HTTPException(
                status_code=400, detail="from_date and to_date are required"
            )

        if not weekdays:
            raise HTTPException(status_code=400, detail="weekdays list is required")

        city_name = city_name.upper()

        average_travel_time_data = fetch_average_travel_time_by_hour(
            city_name, display_names, from_date, to_date, weekdays
        )

        if average_travel_time_data is None:
            raise HTTPException(
                status_code=500, detail="Error calculating average travel time by hour"
            )

        return average_travel_time_data
    except HTTPException:
        raise
    except Exception as e:
        print(f"DEBUGGING ERROR: {e}")
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal Debugging Error: {e}")


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
            raise HTTPException(status_code=500, detail=f"Error decompressing file: {str(e)}")
    
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
