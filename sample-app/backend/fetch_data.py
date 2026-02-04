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


import os
import json
import time
from google.cloud import bigquery
import pytz
from datetime import datetime, timedelta
from typing import List, Dict, Any, Tuple
from dotenv import load_dotenv
import concurrent.futures
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from zoneinfo import ZoneInfo
from functools import wraps
from cachetools import TTLCache
import hashlib

load_dotenv("../.env")

# Cache configuration
# TTL (time-to-live) in seconds: 15 minutes for query results
CACHE_TTL = 900  # 15 minutes
CACHE_MAX_SIZE = 1000  # Maximum number of cached items

# Create TTL cache instances for different query types
route_metrics_cache = TTLCache(maxsize=CACHE_MAX_SIZE, ttl=CACHE_TTL)
route_specific_cache = TTLCache(maxsize=CACHE_MAX_SIZE, ttl=CACHE_TTL)
avg_travel_time_cache = TTLCache(maxsize=CACHE_MAX_SIZE, ttl=CACHE_TTL)
hourly_data_cache = TTLCache(maxsize=CACHE_MAX_SIZE, ttl=CACHE_TTL)
latest_data_cache = TTLCache(maxsize=100, ttl=300)  # 5 minutes for latest data
city_details_cache = TTLCache(maxsize=50, ttl=3600)  # 1 hour for city details

def get_city_config(city_name: str) -> Dict[str, str]:
    """
    Centralized function to fetch and validate environment variables for a city.
    
    Args:
        city_name: Name of the city (e.g., "GURGAON")
    
    Returns:
        Dictionary containing all required configuration for the city:
        {
            "bq_project": str,
            "bq_historical_dataset": str, 
            "bq_historical_table": str,
            "bq_routes_table": str,
            "timezone_name": str
        }
    
    Raises:
        ValueError: If required environment variables are missing or invalid
    """
    try:
        bq_project = os.getenv(f"{city_name}_BIGQUERY_PROJECT")
        bq_historical_dataset = os.getenv(f"{city_name}_BIGQUERY_HISTORICAL_DATASET")
        bq_historical_table = os.getenv(f"{city_name}_BIGQUERY_HISTORICAL_TABLE")
        bq_routes_table = os.getenv(f"{city_name}_BIGQUERY_ROUTES_TABLE")
        timezone_name = os.getenv(f"{city_name}_TIMEZONE")

        if not all([bq_project, bq_historical_dataset, bq_historical_table, bq_routes_table, timezone_name]):
            raise ValueError("Required environment variables are not set.")

        return {
            "bq_project": bq_project,
            "bq_historical_dataset": bq_historical_dataset,
            "bq_historical_table": bq_historical_table,
            "bq_routes_table": bq_routes_table,
            "timezone_name": timezone_name
        }

    except (TypeError, ValueError) as e:
        print(f"Error: Missing or invalid environment variables for '{city_name}'. Please check your .env file. Error: {e}")
        raise

def create_cache_key(*args, **kwargs) -> str:
    """
    Create a unique cache key from function arguments.
    Uses MD5 hash of the JSON-serialized arguments.
    """
    # Convert args and kwargs to a stable string representation
    key_data = {
        'args': args,
        'kwargs': {k: v for k, v in sorted(kwargs.items())}
    }
    key_string = json.dumps(key_data, sort_keys=True, default=str)
    return hashlib.md5(key_string.encode()).hexdigest()

def cache_query(cache_instance):
    """
    Decorator to cache query results based on function parameters.
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Create cache key from all arguments
            cache_key = f"{func.__name__}:{create_cache_key(*args, **kwargs)}"
            
            # Check if result is in cache
            if cache_key in cache_instance:
                print(f"Cache HIT for {func.__name__}")
                return cache_instance[cache_key]
            
            # Execute function and cache result
            print(f"Cache MISS for {func.__name__}, executing query...")
            result = func(*args, **kwargs)
            cache_instance[cache_key] = result
            
            return result
        return wrapper
    return decorator

def clear_all_caches():
    """
    Clear all cache instances. Useful for manual cache invalidation.
    """
    route_metrics_cache.clear()
    route_specific_cache.clear()
    avg_travel_time_cache.clear()
    hourly_data_cache.clear()
    latest_data_cache.clear()
    city_details_cache.clear()
    print("All caches cleared")

# Function to fetch hourly aggregated data from BigQuery
@cache_query(hourly_data_cache)
def fetch_hourly_aggregated_data(city_name: str, display_names: List[str], from_date: str, to_date: str, weekdays: List[int]) -> Tuple[List[Dict[str, Any]], str]:
    """
    Fetches hourly aggregated historical traffic data from BigQuery for specified routes,
    a given date range, and a list of specific weekdays (1=Sunday, 7=Saturday).

    If from_date == to_date, the weekday filter is ignored so that single-day data is always returned.
    """
    try:
        config = get_city_config(city_name)
        bq_project = config["bq_project"]
        bq_historical_dataset = config["bq_historical_dataset"]
        bq_historical_table = config["bq_historical_table"]
        bq_routes_table = config["bq_routes_table"]
        timezone_name = config["timezone_name"]
    except ValueError:
        return []

    single_day = (from_date == to_date)

    # build weekday filter only if multi-day
    weekday_filter = ""
    if not single_day:
        if not weekdays or not all(1 <= d <= 7 for d in weekdays):
            print("Warning: No valid weekdays (1=Sun to 7=Sat) provided. Returning empty data.")
            return []
        weekdays_str = json.dumps(weekdays)
        weekday_filter = f"""
            AND EXTRACT(DAYOFWEEK FROM record_time AT TIME ZONE '{timezone_name}') 
                IN (SELECT CAST(w AS INT64) FROM UNNEST(JSON_QUERY_ARRAY('{weekdays_str}', '$')) AS w)
        """

    print(f"Fetching data for city: {city_name}, from: {from_date}, to: {to_date}, weekdays: {weekdays if not single_day else 'IGNORED'}, display_names: {display_names if display_names else 'ALL'}")

    try:
        client = bigquery.Client(project=bq_project)
    except Exception as e:
        print(f"Error setting up BigQuery client: {e}")
        return []

    if isinstance(display_names, list) and display_names:
        query = f"""
        WITH route_ids_for_display_names AS (
            SELECT
                selected_route_id
            FROM
                `{bq_project}.{bq_historical_dataset}.{bq_routes_table}`
            WHERE
                display_name IN UNNEST({json.dumps(display_names)})
        )
        SELECT
            selected_route_id,
            FORMAT_TIMESTAMP('%H:00:00', TIMESTAMP_TRUNC(record_time, HOUR, '{timezone_name}')) AS record_time,
            AVG(duration_in_seconds) AS avg_duration_in_seconds,
            AVG(static_duration_in_seconds) AS avg_static_duration_in_seconds
        FROM
            `{bq_project}.{bq_historical_dataset}.{bq_historical_table}`
        WHERE
            record_time >= TIMESTAMP(DATETIME '{from_date} 00:00:00', '{timezone_name}')
            AND record_time <= TIMESTAMP(DATETIME '{to_date} 23:59:59', '{timezone_name}')
            {weekday_filter}
            AND selected_route_id IN (SELECT selected_route_id FROM route_ids_for_display_names)
        GROUP BY
            selected_route_id,
            record_time
        ORDER BY
            selected_route_id,
            record_time;
        """
    else:
        query = f"""
        WITH route_ids_to_process AS (
            SELECT selected_route_id
            FROM `{bq_project}.{bq_historical_dataset}.{bq_routes_table}`
            WHERE status = 'STATUS_RUNNING'
        )
        SELECT
            selected_route_id,
            FORMAT_TIMESTAMP('%H:00:00', TIMESTAMP_TRUNC(record_time, HOUR, '{timezone_name}')) AS record_time,
            AVG(duration_in_seconds) AS avg_duration_in_seconds,
            AVG(static_duration_in_seconds) AS avg_static_duration_in_seconds
        FROM
            `{bq_project}.{bq_historical_dataset}.{bq_historical_table}`
        WHERE
            record_time >= TIMESTAMP(DATETIME '{from_date} 00:00:00', '{timezone_name}')
            AND record_time <= TIMESTAMP(DATETIME '{to_date} 23:59:59', '{timezone_name}')
            {weekday_filter}
            AND selected_route_id IN (SELECT selected_route_id FROM route_ids_to_process)
        GROUP BY
            selected_route_id,
            record_time
        ORDER BY
            selected_route_id,
            record_time;
        """

    # print("Executing query...", query)

    try:
        query_job = client.query(query)
        results = query_job.result()
    except Exception as e:
        print(f"An error occurred during query execution: {e}")
        return []

    print("Query executed successfully. Processing results...")

    def get_dynamic_hour_shift(timezone_name):
        tz = pytz.timezone(timezone_name)
        utc_offset = datetime.now(tz).utcoffset()
        total_minutes = int(utc_offset.total_seconds() // 60)
        hours_offset = total_minutes // 60
        minutes_offset = total_minutes % 60

        if minutes_offset > 30 and hours_offset < 23:
            hours_offset += 1
        elif minutes_offset < -30 and hours_offset > -23:
            hours_offset -= 1
        return hours_offset

    timezone_offset = get_dynamic_hour_shift(timezone_name)

    def shift_hour(record_time_str, hour_shift):
        try:
            record_time = datetime.strptime(record_time_str, '%H:00:00')
            shifted_time = record_time + timedelta(hours=hour_shift)
            if shifted_time.hour >= 24:
                shifted_time = shifted_time - timedelta(hours=24)
            elif shifted_time.hour < 0:
                shifted_time = shifted_time + timedelta(hours=24)
            return shifted_time.strftime('%H:00:00')
        except ValueError:
            return record_time_str

    output = []
    for row in results:
        shifted_hour = shift_hour(row.record_time, timezone_offset)
        output.append({
            "selected_route_id": row.selected_route_id,
            "record_time": shifted_hour,
            "static_duration_in_seconds": row.avg_static_duration_in_seconds,
            "duration_in_seconds": row.avg_duration_in_seconds
        })

    sorted_output = []
    grouped_data = {}

    for entry in output:
        route_id = entry["selected_route_id"]
        grouped_data.setdefault(route_id, []).append(entry)

    for route_id, entries in grouped_data.items():
        sorted_entries = sorted(entries, key=lambda x: x["record_time"])
        sorted_output.extend(sorted_entries)

    return sorted_output

@cache_query(route_metrics_cache)
def fetch_route_metrics(city_name: str, display_names: List[str], from_date: str, to_date: str, weekdays: List[int]) -> Dict[str, Dict[int, float]]:
    """
    Fetches historical traffic data and calculates route metrics including:
    - Planning Time Index (PTI): 95th percentile / average free flow time
    - Travel Time Index (TTI): average travel time / average free flow time
    - Average Travel Time
    - Free Flow Time (Average Static Duration)
    - 95th Percentile Travel Time
    
    Similar to calculateRouteMetrics in TypeScript.
    
    Args:
        city_name: Name of the city (e.g., "GURGAON")
        display_names: List of route display names to filter (empty list processes ALL routes)
        from_date: Start date in 'YYYY-MM-DD' format
        to_date: End date in 'YYYY-MM-DD' format
        weekdays: List of weekdays to include (1=Sunday, 7=Saturday)
    
    Returns:
        Dictionary containing hourly metrics:
        {
            "hourlyPlanningTimeIndex": {0: 1.2, 1: 1.3, ...},  # dimensionless ratio
            "hourlyTravelTimeIndex": {0: 1.1, 1: 1.2, ...},    # dimensionless ratio
            "hourlyAverageTravelTime": {0: 30.0, 1: 30.83, ...},  # in minutes
            "hourlyFreeFlowTime": {0: 25.0, 1: 25.83, ...},       # in minutes
            "hourly95thPercentile": {0: 33.33, 1: 35.0, ...}      # in minutes
        }
    """
    try:
        config = get_city_config(city_name)
        bq_project = config["bq_project"]
        bq_historical_dataset = config["bq_historical_dataset"]
        bq_historical_table = config["bq_historical_table"]
        bq_routes_table = config["bq_routes_table"]
        timezone_name = config["timezone_name"]
    except ValueError:
        return _empty_metrics()

    if not weekdays or not all(1 <= d <= 7 for d in weekdays):
        print("Warning: No valid weekdays (1=Sun to 7=Sat) provided. Returning empty data.")
        return _empty_metrics()

    weekdays_str = json.dumps(weekdays)

    try:
        client = bigquery.Client(project=bq_project)
    except Exception as e:
        print(f"Error setting up BigQuery client: {e}")
        return _empty_metrics()
    
    # Build query with two-step aggregation to match TypeScript logic:
    # Step 1 (inner): Average each route per hour per date (handles multiple measurements within hour)
    # Step 2 (outer): Sum all routes together per hour per date (total network traversal time)
    # Also return per-route data for individual route analysis
    if display_names:
        query = f"""
        WITH route_ids_for_display_names AS (
            SELECT
                selected_route_id
            FROM
                `{bq_project}.{bq_historical_dataset}.{bq_routes_table}`
            WHERE
                display_name IN UNNEST({json.dumps(display_names)})
        ),
        route_hourly_avg AS (
            -- Step 1: Average each route per hour per date
            -- Fallback: If static_duration is missing or invalid, use duration as free-flow time
            -- This matches the TypeScript calculateRouteMetrics logic
            SELECT
                selected_route_id,
                DATE(record_time, '{timezone_name}') AS record_date,
                EXTRACT(HOUR FROM record_time AT TIME ZONE '{timezone_name}') AS hour,
                AVG(duration_in_seconds) AS avg_duration,
                AVG(
                    IF(static_duration_in_seconds IS NULL OR static_duration_in_seconds <= 0, 
                       duration_in_seconds, 
                       static_duration_in_seconds)
                ) AS avg_static_duration
            FROM
                `{bq_project}.{bq_historical_dataset}.{bq_historical_table}`
            WHERE
                DATE(record_time, '{timezone_name}') BETWEEN '{from_date}' AND '{to_date}'
                AND EXTRACT(DAYOFWEEK FROM record_time AT TIME ZONE '{timezone_name}') IN (SELECT CAST(w AS INT64) FROM UNNEST(JSON_QUERY_ARRAY('{weekdays_str}', '$')) AS w)
                AND selected_route_id IN (SELECT selected_route_id FROM route_ids_for_display_names)
                AND duration_in_seconds IS NOT NULL
                AND duration_in_seconds > 0
            GROUP BY
                selected_route_id,
                record_date,
                hour
        )
        -- Return both aggregated and per-route data
        SELECT
            'network' AS data_type,
            NULL AS route_id,
            record_date,
            hour,
            SUM(avg_duration) AS total_duration,
            SUM(avg_static_duration) AS total_static_duration
        FROM
            route_hourly_avg
        GROUP BY
            record_date,
            hour
        UNION ALL
        SELECT
            'per_route' AS data_type,
            selected_route_id AS route_id,
            record_date,
            hour,
            avg_duration AS total_duration,
            avg_static_duration AS total_static_duration
        FROM
            route_hourly_avg
        ORDER BY
            data_type,
            route_id,
            hour,
            record_date;
        """
    else:
        # Process ALL routes with two-step aggregation
        query = f"""
        WITH route_hourly_avg AS (
            -- Step 1: Average each route per hour per date
            -- Fallback: If static_duration is missing or invalid, use duration as free-flow time
            -- This matches the TypeScript calculateRouteMetrics logic
            SELECT
                selected_route_id,
                DATE(record_time, '{timezone_name}') AS record_date,
                EXTRACT(HOUR FROM record_time AT TIME ZONE '{timezone_name}') AS hour,
                AVG(duration_in_seconds) AS avg_duration,
                AVG(
                    IF(static_duration_in_seconds IS NULL OR static_duration_in_seconds <= 0, 
                       duration_in_seconds, 
                       static_duration_in_seconds)
                ) AS avg_static_duration
            FROM
                `{bq_project}.{bq_historical_dataset}.{bq_historical_table}`
            WHERE
                DATE(record_time, '{timezone_name}') BETWEEN '{from_date}' AND '{to_date}'
                AND EXTRACT(DAYOFWEEK FROM record_time AT TIME ZONE '{timezone_name}') IN (SELECT CAST(w AS INT64) FROM UNNEST(JSON_QUERY_ARRAY('{weekdays_str}', '$')) AS w)
                AND duration_in_seconds IS NOT NULL
                AND duration_in_seconds > 0
            GROUP BY
                selected_route_id,
                record_date,
                hour
        )
        -- Return both aggregated and per-route data
        SELECT
            'network' AS data_type,
            NULL AS route_id,
            record_date,
            hour,
            SUM(avg_duration) AS total_duration,
            SUM(avg_static_duration) AS total_static_duration
        FROM
            route_hourly_avg
        GROUP BY
            record_date,
            hour
        UNION ALL
        SELECT
            'per_route' AS data_type,
            selected_route_id AS route_id,
            record_date,
            hour,
            avg_duration AS total_duration,
            avg_static_duration AS total_static_duration
        FROM
            route_hourly_avg
        ORDER BY
            data_type,
            route_id,
            hour,
            record_date;
        """
    
    try:
        query_job = client.query(query)
        results = query_job.result()
    except Exception as e:
        print(f"An error occurred during query execution: {e}")
        return _empty_metrics()

    # Note: BigQuery already returns hours in the local timezone via:
    # EXTRACT(HOUR FROM record_time AT TIME ZONE '{timezone_name}')
    # So we don't need to apply any timezone offset in Python

    # Group data by hour - collect summed values per date per hour (across ALL routes)
    # Structure: {hour: {'travel_times': [list of total durations], 'free_flow_times': [list of total static_durations]}}
    # Each value in the list represents the sum of all routes for one date at that hour
    # This matches the TypeScript logic exactly
    hourly_data = {}
    per_route_data = {}  # {route_id: {hour: {'travel_times': [...], 'free_flow_times': [...]}}}
    
    for row in results:
        # Hour is already in local timezone from BigQuery
        hour = row.hour
        
        total_duration = float(row.total_duration)
        total_static_duration = float(row.total_static_duration)
        data_type = row.data_type
        route_id = row.route_id
        
        if data_type == 'network':
            # Network-wide data
            if hour not in hourly_data:
                hourly_data[hour] = {
                    'travel_times': [],
                    'free_flow_times': []
                }
            
            # Append summed values (each row represents sum of all routes for one date at one hour)
            # Note: static_duration validation already handled in SQL query with fallback logic
            if total_duration > 0:
                hourly_data[hour]['travel_times'].append(total_duration)
                hourly_data[hour]['free_flow_times'].append(total_static_duration)
        
        elif data_type == 'per_route' and route_id:
            # Per-route data
            if route_id not in per_route_data:
                per_route_data[route_id] = {}
            
            if hour not in per_route_data[route_id]:
                per_route_data[route_id][hour] = {
                    'travel_times': [],
                    'free_flow_times': []
                }
            
            # Append route-specific values
            # Note: static_duration validation already handled in SQL query with fallback logic
            if total_duration > 0:
                per_route_data[route_id][hour]['travel_times'].append(total_duration)
                per_route_data[route_id][hour]['free_flow_times'].append(total_static_duration)
    
    # Calculate metrics for each hour
    hourly_planning_time_index = {}
    hourly_travel_time_index = {}
    hourly_average_travel_time = {}
    hourly_free_flow_time = {}
    hourly_95th_percentile = {}
    
    # Process all 24 hours
    for hour in range(24):
        if hour not in hourly_data or not hourly_data[hour]['travel_times']:
            # No data for this hour
            hourly_planning_time_index[hour] = 0
            hourly_travel_time_index[hour] = 0
            hourly_average_travel_time[hour] = 0
            hourly_free_flow_time[hour] = 0
            hourly_95th_percentile[hour] = 0
            continue
        
        # Get all travel times and free flow times for this hour
        all_travel_times = hourly_data[hour]['travel_times']
        all_free_flow_times = hourly_data[hour]['free_flow_times']
        
        if not all_travel_times or not all_free_flow_times:
            hourly_planning_time_index[hour] = 0
            hourly_travel_time_index[hour] = 0
            hourly_average_travel_time[hour] = 0
            hourly_free_flow_time[hour] = 0
            hourly_95th_percentile[hour] = 0
            continue
        
        # Calculate 95th percentile
        percentile_95 = np.percentile(all_travel_times, 95)
        
        # Calculate averages
        avg_travel_time = np.mean(all_travel_times)
        avg_free_flow_time = np.mean(all_free_flow_times)
        
        # Calculate indices
        planning_time_index = percentile_95 / avg_free_flow_time if avg_free_flow_time > 0 else 0
        travel_time_index = avg_travel_time / avg_free_flow_time if avg_free_flow_time > 0 else 0
        
        # Ensure TTI is at least 1
        if travel_time_index < 1 and travel_time_index > 0:
            travel_time_index = 1
        
        # Store results (convert time values from seconds to minutes)
        hourly_planning_time_index[hour] = round(planning_time_index, 4)
        hourly_travel_time_index[hour] = round(travel_time_index, 4)
        hourly_average_travel_time[hour] = round(avg_travel_time, 2)
        hourly_free_flow_time[hour] = round(avg_free_flow_time , 2)
        hourly_95th_percentile[hour] = round(percentile_95 , 2)
    
    # Calculate per-route metrics
    per_route_95th_percentile = {}  # {route_id: {hour: value}}
    per_route_free_flow_time = {}   # {route_id: {hour: value}}
    
    for route_id, route_hours in per_route_data.items():
        per_route_95th_percentile[route_id] = {}
        per_route_free_flow_time[route_id] = {}
        
        for hour in range(24):
            if hour not in route_hours or not route_hours[hour]['travel_times']:
                per_route_95th_percentile[route_id][hour] = 0
                per_route_free_flow_time[route_id][hour] = 0
            else:
                travel_times = route_hours[hour]['travel_times']
                free_flow_times = route_hours[hour]['free_flow_times']
                
                # Calculate 95th percentile for this route at this hour
                percentile_95 = np.percentile(travel_times, 95)
                avg_free_flow = np.mean(free_flow_times)
                
                per_route_95th_percentile[route_id][hour] = round(percentile_95, 2)
                per_route_free_flow_time[route_id][hour] = round(avg_free_flow, 2)
    
    return {
        "hourlyPlanningTimeIndex": hourly_planning_time_index,
        "hourlyTravelTimeIndex": hourly_travel_time_index,
        "hourlyAverageTravelTime": hourly_average_travel_time,
        "hourlyFreeFlowTime": hourly_free_flow_time,
        "hourly95thPercentile": hourly_95th_percentile,
        "perRouteMetrics": {
            "hourly95thPercentile": per_route_95th_percentile,
            "hourlyFreeFlowTime": per_route_free_flow_time
        }
    }


def _empty_metrics() -> Dict[str, Dict[int, float]]:
    """Helper function to return empty metrics structure."""
    empty_dict = {hour: 0 for hour in range(24)}
    return {
        "hourlyPlanningTimeIndex": empty_dict.copy(),
        "hourlyTravelTimeIndex": empty_dict.copy(),
        "hourlyAverageTravelTime": empty_dict.copy(),
        "hourlyFreeFlowTime": empty_dict.copy(),
        "hourly95thPercentile": empty_dict.copy(),
        "perRouteMetrics": {
            "hourly95thPercentile": {},
            "hourlyFreeFlowTime": {}
        }
    }

@cache_query(avg_travel_time_cache)
def fetch_average_travel_time_by_hour(city_name: str, display_names: List[str], from_date: str, to_date: str, weekdays: List[int]) -> Dict[str, Any]:
    """
    Fetches average travel time by hour for all routes or specific routes.
    Similar to calculateAverageTravelTimeByHour in TypeScript.
    
    Args:
        city_name: Name of the city (e.g., "GURGAON")
        display_names: List of route display names to filter (empty list processes ALL routes)
        from_date: Start date in 'YYYY-MM-DD' format
        to_date: End date in 'YYYY-MM-DD' format
        weekdays: List of weekdays to include (1=Sunday, 7=Saturday)
    
    Returns:
        Dictionary containing:
        {
            "routeHourlyAverages": {
                "route_id_1": {0: 120.5, 1: 125.3, ...},  # seconds
                "route_id_2": {0: 180.2, 1: 185.7, ...}
            },
            "hourlyTotalAverages": {
                0: {"totalDuration": 3000.5, "count": 150},  # seconds
                1: {"totalDuration": 3100.2, "count": 155},
                ...
            }
        }
    """
    try:
        config = get_city_config(city_name)
        bq_project = config["bq_project"]
        bq_historical_dataset = config["bq_historical_dataset"]
        bq_historical_table = config["bq_historical_table"]
        bq_routes_table = config["bq_routes_table"]
        timezone_name = config["timezone_name"]
    except ValueError:
        return _empty_average_travel_time_data()

    if not weekdays or not all(1 <= d <= 7 for d in weekdays):
        print("Warning: No valid weekdays (1=Sun to 7=Sat) provided. Returning empty data.")
        return _empty_average_travel_time_data()

    weekdays_str = json.dumps(weekdays)

    try:
        client = bigquery.Client(project=bq_project)
    except Exception as e:
        print(f"Error setting up BigQuery client: {e}")
        return _empty_average_travel_time_data()
    
    # Build query with aggregation in BigQuery (much faster than processing raw rows in Python)
    if display_names:
        query = f"""
        WITH route_ids_for_display_names AS (
            SELECT
                selected_route_id
            FROM
                `{bq_project}.{bq_historical_dataset}.{bq_routes_table}`
            WHERE
                display_name IN UNNEST({json.dumps(display_names)})
        ),
        route_hourly_avg AS (
            -- Aggregate: Average each route per hour per date
            -- NOTE: We validate BOTH duration_in_seconds AND static_duration_in_seconds
            -- Routes without static_duration are invalid/incomplete routes (must match getFilteredHistoricalData logic)
            SELECT
                selected_route_id,
                DATE(record_time, '{timezone_name}') AS record_date,
                EXTRACT(HOUR FROM record_time AT TIME ZONE '{timezone_name}') AS hour,
                AVG(duration_in_seconds) AS avg_duration
            FROM
                `{bq_project}.{bq_historical_dataset}.{bq_historical_table}`
            WHERE
                DATE(record_time, '{timezone_name}') BETWEEN '{from_date}' AND '{to_date}'
                AND EXTRACT(DAYOFWEEK FROM record_time AT TIME ZONE '{timezone_name}') IN (SELECT CAST(w AS INT64) FROM UNNEST(JSON_QUERY_ARRAY('{weekdays_str}', '$')) AS w)
                AND selected_route_id IN (SELECT selected_route_id FROM route_ids_for_display_names)
                AND duration_in_seconds IS NOT NULL
                AND duration_in_seconds > 0
            GROUP BY
                selected_route_id,
                record_date,
                hour
        )
        SELECT
            selected_route_id,
            record_date,
            hour,
            avg_duration
        FROM
            route_hourly_avg
        ORDER BY
            selected_route_id,
            record_date,
            hour;
        """
    else:
        # Process ALL routes with aggregation
        query = f"""
        WITH route_ids_to_process AS (
            SELECT selected_route_id
            FROM `{bq_project}.{bq_historical_dataset}.{bq_routes_table}`
            WHERE status = 'STATUS_RUNNING'
        ),
        route_hourly_avg AS (
            -- Aggregate: Average each route per hour per date
            -- NOTE: We validate BOTH duration_in_seconds AND static_duration_in_seconds
            -- Routes without static_duration are invalid/incomplete routes (must match getFilteredHistoricalData logic)
            SELECT
                selected_route_id,
                DATE(record_time, '{timezone_name}') AS record_date,
                EXTRACT(HOUR FROM record_time AT TIME ZONE '{timezone_name}') AS hour,
                AVG(duration_in_seconds) AS avg_duration
            FROM
                `{bq_project}.{bq_historical_dataset}.{bq_historical_table}`
            WHERE
                DATE(record_time, '{timezone_name}') BETWEEN '{from_date}' AND '{to_date}'
                AND EXTRACT(DAYOFWEEK FROM record_time AT TIME ZONE '{timezone_name}') IN (SELECT CAST(w AS INT64) FROM UNNEST(JSON_QUERY_ARRAY('{weekdays_str}', '$')) AS w)
                AND selected_route_id IN (SELECT selected_route_id FROM route_ids_to_process)
                AND duration_in_seconds IS NOT NULL
                AND duration_in_seconds > 0
            GROUP BY
                selected_route_id,
                record_date,
                hour
        )
        SELECT
            selected_route_id,
            record_date,
            hour,
            avg_duration
        FROM
            route_hourly_avg
        ORDER BY
            selected_route_id,
            record_date,
            hour;
        """
    
    try:
        query_job = client.query(query)
        results = query_job.result()
    except Exception as e:
        print(f"An error occurred during query execution: {e}")
        return _empty_average_travel_time_data()

    # Note: BigQuery already returns hours in the local timezone via:
    # EXTRACT(HOUR FROM record_time AT TIME ZONE '{timezone_name}')
    # So we don't need to apply any timezone offset in Python

    # Group aggregated data by hour -> date -> route
    # Structure: {hour: {date_string: {route_id: avg_duration}}}
    hourly_route_data = {}
    all_route_ids = set()
    
    for row in results:
        # Hour is already in local timezone from BigQuery
        hour = row.hour
        
        date_string = row.record_date.strftime('%Y-%m-%d')
        route_id = row.selected_route_id
        avg_duration = float(row.avg_duration)  # Already averaged by BigQuery
        
        all_route_ids.add(route_id)
        
        
        if hour not in hourly_route_data:
            hourly_route_data[hour] = {}
        
        if date_string not in hourly_route_data[hour]:
            hourly_route_data[hour][date_string] = {}
        
        # Store the pre-averaged duration
        hourly_route_data[hour][date_string][route_id] = avg_duration
    
    # Calculate per-route averages for each hour (averaged across dates)
    route_hourly_averages = {}
    
    # Initialize maps for each route
    for route_id in all_route_ids:
        route_hourly_averages[route_id] = {}
    
    # Calculate average for each route-hour across all dates
    for hour in range(24):
        if hour not in hourly_route_data:
            # No data for this hour
            for route_id in all_route_ids:
                route_hourly_averages[route_id][hour] = 0
            continue
        
        # Collect durations for each route across all dates
        route_durations = {}
        
        for date_string, route_map in hourly_route_data[hour].items():
            for route_id, avg_duration in route_map.items():
                # avg_duration is already averaged by BigQuery for this route-date-hour
                if route_id not in route_durations:
                    route_durations[route_id] = []
                route_durations[route_id].append(avg_duration)
        
        # Calculate average across all dates for each route
        for route_id in all_route_ids:
            if route_id in route_durations and route_durations[route_id]:
                avg_duration = sum(route_durations[route_id]) / len(route_durations[route_id])
                route_hourly_averages[route_id][hour] = round(avg_duration, 2)
            else:
                route_hourly_averages[route_id][hour] = 0
    
    # Calculate total network travel time for each hour (matching TypeScript logic)
    # Structure: {hour: {date_string: {total_duration: float}}}
    hourly_data = {}
    
    for hour, date_map in hourly_route_data.items():
        if hour not in hourly_data:
            hourly_data[hour] = {}
        
        for date_string, route_map in date_map.items():
            date_total_duration = 0
            
            # Sum up all unique routes for this hour-date
            for avg_duration in route_map.values():
                # avg_duration is already averaged by BigQuery
                date_total_duration += avg_duration
            
            hourly_data[hour][date_string] = {
                'total_duration': date_total_duration
            }
    
    # Calculate final metrics for each hour (matching TypeScript logic)
    hourly_total_averages = {}
    
    for hour in range(24):
        if hour not in hourly_data or not hourly_data[hour]:
            # No data for this hour
            hourly_total_averages[hour] = {'totalDuration': 0, 'count': 0}
            continue
        
        # Extract travel times
        travel_times = []
        
        for day_data in hourly_data[hour].values():
            if day_data['total_duration'] > 0:
                travel_times.append(day_data['total_duration'])
        
        if not travel_times:
            hourly_total_averages[hour] = {'totalDuration': 0, 'count': 0}
            continue
        
        # Calculate average travel time
        average_travel_time = sum(travel_times) / len(travel_times)
        
        hourly_total_averages[hour] = {
            'totalDuration': round(average_travel_time, 2),
            'count': len(travel_times)
        }
    
    return {
        "routeHourlyAverages": route_hourly_averages,
        "hourlyTotalAverages": hourly_total_averages
    }


def _empty_average_travel_time_data() -> Dict[str, Any]:
    """Helper function to return empty average travel time data structure."""
    empty_hourly = {hour: {'totalDuration': 0, 'count': 0} for hour in range(24)}
    return {
        "routeHourlyAverages": {},
        "hourlyTotalAverages": empty_hourly
    }
  
@cache_query(latest_data_cache)
def fetch_latest_historical_data(city_name: str):
    """
    Fetches the latest historical traffic data using a two-step cost-optimized 
    BigQuery pipeline (fetch max_time, then fetch 1-day data).

    Args:
        city_name (str): The name of the city (e.g., "GURGAON" or "ABU_DHABI")
                         to use for configuration.

    Returns:
        tuple: A tuple containing:
            - dict: A GeoJSON FeatureCollection dictionary of the real-time data.
            - str: The name of the output file.
    """
    try:
        config = get_city_config(city_name)
        bq_project = config["bq_project"]
        bq_historical_dataset = config["bq_historical_dataset"]
        bq_historical_table = config["bq_historical_table"]
        bq_routes_table = config["bq_routes_table"]
        timezone_name = config["timezone_name"]
    except ValueError:
        return {}, ""

    try:
        # Client initialization should ideally be handled outside this function if possible
        client = bigquery.Client(project=bq_project) 
    except Exception as e:
        print(f"Error setting up BigQuery client: {e}")
        return {}, ""

    # --- STEP 1: Fetch the MAX(record_time) ---
    max_time_query = f"""
    SELECT
      MAX(record_time) AS max_time
    FROM
      `{bq_project}.{bq_historical_dataset}.{bq_historical_table}`
    """
    
    max_time_ts = None
    try:
        max_time_job = client.query(max_time_query)
        max_time_results = max_time_job.result()
        
        if max_time_results.total_rows > 0:
            max_time_ts = next(iter(max_time_results))['max_time']
            max_time_str = max_time_ts.isoformat()
        else:
            print("Error: No data found in historical table.")
            return {}, ""
    except Exception as e:
        print(f"An error occurred during MAX_TIME query execution: {e}")
        return {}, ""

    # --- STEP 2: Fetch latest 1-day data for running routes, using the MAX time ---
    
    # We use the SQL structure from latest_data_query.sql and format it
    latest_data_template = f"""
    WITH
      RunningRoutes AS (
        SELECT
          selected_route_id
        FROM
          `{bq_project}.{bq_historical_dataset}.{bq_routes_table}`
        WHERE
          status = 'STATUS_RUNNING'
      )
    SELECT
      selected_route_id,
      record_time,
      duration_in_seconds,
      static_duration_in_seconds,
      route_geometry
    FROM (
      SELECT
        t1.selected_route_id,
        t1.record_time,
        t1.duration_in_seconds,
        t1.static_duration_in_seconds,
        t1.route_geometry,
        ROW_NUMBER() OVER (
          PARTITION BY t1.selected_route_id
          ORDER BY t1.record_time DESC
        ) AS rn
      FROM
        `{bq_project}.{bq_historical_dataset}.{bq_historical_table}` AS t1
      INNER JOIN
        RunningRoutes AS t2
        ON t1.selected_route_id = t2.selected_route_id      
      WHERE
        t1.record_time BETWEEN TIMESTAMP_SUB(TIMESTAMP '{{max_time_timestamp}}', INTERVAL 1 DAY) 
                           AND TIMESTAMP '{{max_time_timestamp}}'
    ) AS subquery
    WHERE
      rn = 1;
    """

    # Format the template with dynamic parameters (including the retrieved max time)
    query = latest_data_template.format(
        max_time_timestamp=max_time_str,
        bq_project=bq_project,
        bq_historical_dataset=bq_historical_dataset,
        bq_historical_table=bq_historical_table,
        bq_routes_table=bq_routes_table
    )

    # print(query)

    try:
        query_job = client.query(query)
        results = query_job.result()
    except Exception as e:
        print(f"An error occurred during main query execution: {e}")
        return {}, ""

    def parse_linestring(wkt_string):
        if not wkt_string or not wkt_string.startswith("LINESTRING("):
            return None
        coords_string = wkt_string.split("(", 1)[1].rsplit(")", 1)[0]
        coordinate_pairs = coords_string.split(", ")
        coordinates = []
        for pair in coordinate_pairs:
            lon, lat = map(float, pair.split())
            coordinates.append([lon, lat])
        return {
            "type": "LineString",
            "coordinates": coordinates
        }

    geojson_features = []
    latest_record_time = None  # Track the most recent record time across all routes
    utc_timezone = pytz.utc
    try:
        local_timezone = pytz.timezone(timezone_name)
    except pytz.UnknownTimeZoneError:
        print(f"Error: Unknown timezone '{timezone_name}'. Using UTC instead.")
        local_timezone = utc_timezone

    for row in results:
        try:
            route_geometry_dict = parse_linestring(row.route_geometry)
            if not route_geometry_dict or not route_geometry_dict['coordinates']:
                print(f"Skipping row with route ID {row.selected_route_id} due to invalid or empty geometry data.")
                continue

            utc_datetime = row.record_time.replace(tzinfo=utc_timezone)
            local_datetime = utc_datetime.astimezone(local_timezone)
            record_time_str = local_datetime.isoformat()
            
            if latest_record_time is None or local_datetime > latest_record_time:
                latest_record_time = local_datetime

            feature = {
                "type": "Feature",
                "geometry": route_geometry_dict,
                "properties": {
                    "selected_route_id": row.selected_route_id,
                    "record_time": record_time_str,
                    "travel_duration": {
                        "duration_in_seconds": row.duration_in_seconds,
                        "static_duration_in_seconds": row.static_duration_in_seconds
                    }
                }
            }
            geojson_features.append(feature)
        except Exception as e:
            print(f"Skipping row due to data parsing error for route ID {row.selected_route_id}: {e}")
            continue

    geojson_output = {
        "type": "FeatureCollection",
        "features": geojson_features
    }
    
    if latest_record_time is not None:
        final_output = {
            "data": geojson_output,
            "time": latest_record_time.isoformat()
        }
    else:
        final_output = {
            "data": geojson_output,
            "time": "None"
        }

    return final_output

@cache_query(city_details_cache)
def fetch_city_details():
    """
    Fetch details for all cities from environment variables and BigQuery.
    PARALLEL VERSION: Processes all cities concurrently for maximum speed.
    
    Returns:
        dict: Dictionary containing city details with the following structure:
        {
            "city_name": {
                "id": "city_name",
                "name": "City Name",
                "coords": {"lat": float, "lng": float},
                "boundingBox": {
                    "minlng": float,
                    "maxlng": float,
                    "minlat": float,
                    "maxlat": float
                },
                "availableDateRanges": {
                    "startDate": "YYYY-MM-DD",
                    "endDate": "YYYY-MM-DD"
                },
                "useCases": ["realtime-monitoring", "data-analytics", "route-reliability"],
                "timezone": "Europe/Paris"
            }
        }
    """

    # Get all environment variables
    env_vars = dict(os.environ)

    # Find all cities by looking for BIGQUERY_PROJECT variables
    cities = {}
    for key, value in env_vars.items():
        if key.endswith('_BIGQUERY_PROJECT'):
            city_name = key.replace('_BIGQUERY_PROJECT', '').lower()
            cities[city_name] = value

    if not cities:
        print("No cities found in environment variables")
        return {}

    def process_single_city(city_name):
        """Process a single city - optimized for parallel execution."""
        try:
            # Get environment variables for this city using centralized function
            config = get_city_config(city_name.upper())
            bq_project = config["bq_project"]
            bq_historical_dataset = config["bq_historical_dataset"]
            bq_historical_table = config["bq_historical_table"]
            bq_routes_table = config["bq_routes_table"]
            timezone = config["timezone_name"]
            
            # Get additional optional environment variables
            use_cases = os.getenv(f"{city_name.upper()}_USECASES")
            boundary_type = os.getenv(f"{city_name.upper()}_BOUNDARY_TYPE")

            # Validate timezone using zoneinfo
            try:
                ZoneInfo(timezone)  # Will raise exception if invalid
            except Exception:
                print(f"Skipping {city_name}: Invalid timezone {timezone}")
                return None

            # Handle use cases as comma-separated string
            use_cases_list = [uc.strip() for uc in use_cases.split(',')]

            # Initialize BigQuery client
            client = bigquery.Client(project=bq_project)

            date_query = f"""
            SELECT
            MIN(DATETIME(record_time, "{timezone}")) AS first_record_dt_local,
            MAX(DATETIME(record_time, "{timezone}")) AS last_record_dt_local
            FROM `{bq_project}.{bq_historical_dataset}.{bq_historical_table}`
            """

            date_job = client.query(date_query)
            date_results = date_job.result()
            date_row = next(iter(date_results))

            start_date, end_date = None, None

            # Start date rule (existing behavior, now using local datetime)
            if date_row.first_record_dt_local:
                first_dt = date_row.first_record_dt_local  # DATETIME (naive, already in local tz)
                if first_dt.hour == 0 and first_dt.minute == 0 and first_dt.second == 0:
                    start_date = first_dt.date().strftime('%Y-%m-%d')
                else:
                    start_date = (first_dt + timedelta(days=1)).date().strftime('%Y-%m-%d')

            # End date rule (NEW: mirror logic, but shift backwards)
            if date_row.last_record_dt_local:
                last_dt = date_row.last_record_dt_local
                if last_dt.hour == 0 and last_dt.minute == 0 and last_dt.second == 0:
                    end_date = last_dt.date().strftime('%Y-%m-%d')
                else:
                    end_date = (last_dt - timedelta(days=1)).date().strftime('%Y-%m-%d')

            # 2. Fetch ALL route geometries to create polygon and calculate center coordinates
            coords_query = f"""
            SELECT
              ST_EXTENT(route_geometry) AS overall_bounding_box
            FROM
              `{bq_project}.{bq_historical_dataset}.{bq_historical_table}`
            WHERE
              route_geometry IS NOT NULL
              AND record_time BETWEEN TIMESTAMP(DATE_SUB(DATE('{end_date}'), INTERVAL 1 DAY))
                                  AND TIMESTAMP(DATE('{end_date}'))
            """

            coords_job = client.query(coords_query)
            coords_results = coords_job.result()

            # Calculate center coordinates and extract bounding box from overall bounding box
            lat, lng = None, None
            bounding_box = None
            try:
                row = next(iter(coords_results))
                bbox = row.overall_bounding_box
                minx, miny = float(bbox['xmin']), float(bbox['ymin'])
                maxx, maxy = float(bbox['xmax']), float(bbox['ymax'])

                # Calculate center of bounding box
                lng = (minx + maxx) / 2  # center longitude
                lat = (miny + maxy) / 2  # center latitude

                # Store bounding box in object format
                bounding_box = {
                    "minLng": minx,
                    "maxLng": maxx,
                    "minLat": miny,
                    "maxLat": maxy
                }
            except Exception as e:
                print(f"Error calculating coordinates for {city_name}: {e}")
                lat, lng = 0.0, 0.0  # Default fallback on error
                bounding_box = {
                    "minLng": 0.0,
                    "maxLng": 0.0,
                    "minLat": 0.0,
                    "maxLat": 0.0
                }

            # Build city details
            city_details = {
                "id": city_name,
                "name": city_name.title(),
                "coords": {
                    "lat": lat,
                    "lng": lng
                },
                "boundingBox": bounding_box,
                "availableDateRanges": {
                    "startDate": start_date,
                    "endDate": end_date
                },
                "useCases": use_cases_list,
                "timezone": timezone,
                "boundaryType": boundary_type
            }

            print(f"Successfully processed {city_name}")
            return city_name, city_details

        except Exception as e:
            print(f"Error processing {city_name}: {e}")
            return None

    # PARALLEL PROCESSING: Process all cities concurrently
    temp_result = {}
    with ThreadPoolExecutor(max_workers=5) as executor:  # Limit to 5 concurrent BigQuery connections
        future_to_city = {executor.submit(process_single_city, city_name): city_name 
                         for city_name in cities.keys()}

        for future in concurrent.futures.as_completed(future_to_city):
            city_result = future.result()
            if city_result:
                city_name, city_details = city_result
                temp_result[city_name] = city_details

    # Sort cities alphabetically to ensure consistent ordering across reloads
    result = {city_name: temp_result[city_name] for city_name in sorted(temp_result.keys())}

    return result