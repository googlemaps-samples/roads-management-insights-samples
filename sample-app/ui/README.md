# Travel Time Analysis Query

This repository contains a SQL query designed to analyze and compare real-time travel data with historical travel patterns for route optimization and traffic analysis.

## Overview

The query performs a comparative analysis between:

- **Real-time travel data**: Current travel durations for specific routes
- **Historical travel data**: Average travel durations from past records

## Query Structure

The SQL query is composed of three main parts:

### 1. Recent Data CTE (`recent_data`)

```sql
WITH recent_data AS (
    SELECT
        selected_route_id,
        travel_duration.duration_in_seconds,
        retrieval_time.seconds AS retrieval_time_seconds
    FROM
        `rmi-sandbox.demo_paris.rmi_realtime_json` r
    WHERE
        retrieval_time.seconds = (
            SELECT MAX(retrieval_time.seconds)
            FROM `rmi-sandbox.demo_paris.rmi_realtime_json` r2
            WHERE r2.selected_route_id = r.selected_route_id
        )
)
```

**Purpose**: Extracts the most recent travel duration data for each route.

**Key Features**:

- Filters to get only the latest data point per route
- Uses a correlated subquery to find the maximum retrieval time for each route
- Provides current travel conditions

### 2. Average Data CTE (`average_data`)

```sql
average_data AS (
    SELECT
        selected_route_id,
        AVG(static_duration_in_seconds) AS avg_static_duration
    FROM
        `rmi-sandbox.demo_paris.rmi_realtime_json` ht
    WHERE
        ABS(UNIX_SECONDS(ht.record_time) - (
            SELECT MAX(retrieval_time.seconds)
            FROM `rmi-sandbox.demo_paris.rmi_realtime_json` r2
            WHERE r2.selected_route_id = ht.selected_route_id
        )) <= 600
    GROUP BY
        selected_route_id
)
```

**Purpose**: Calculates historical average travel times for comparison.

**Key Features**:

- Computes average static duration for each route
- Uses a **10-minute time window** (600 seconds) to match historical data with recent real-time data
- Ensures temporal relevance by comparing data from similar time periods
- Groups results by route for aggregate calculations

### 3. Final Query

```sql
SELECT
    r.selected_route_id,
    r.duration_in_seconds,
    h.avg_static_duration
FROM
    recent_data r
JOIN
    average_data h
ON
    r.selected_route_id = h.selected_route_id
ORDER BY
    r.selected_route_id;
```

**Purpose**: Combines and presents the comparative results.

**Output**: A dataset containing:

- `selected_route_id`: Unique identifier for each route
- `duration_in_seconds`: Current real-time travel duration
- `avg_static_duration`: Historical average travel duration

## Data Sources

The query operates on two main data tables:

1. **`rmi-sandbox.demo_paris.rmi_realtime_json`**: Contains real-time travel data
2. **`rmi-sandbox.demo_paris.historical_travel_time`**: Contains historical travel time records

## Use Cases

This query is valuable for:

- **Traffic Analysis**: Compare current conditions with historical patterns
- **Route Optimization**: Identify routes with significant deviations from normal travel times
- **Performance Monitoring**: Track how real-time conditions compare to expected travel times
- **Anomaly Detection**: Spot unusual traffic patterns or incidents
- **Capacity Planning**: Understand typical vs. current travel patterns

## Time Window Logic

The query uses a **10-minute tolerance window** to match historical data with real-time data. This approach:

- Accounts for slight timing differences in data collection
- Ensures meaningful comparisons between datasets
- Provides flexibility for data that might not be perfectly synchronized

## Output Format

The results are ordered by `selected_route_id` and include:

| Column                | Description                       | Type      |
| --------------------- | --------------------------------- | --------- |
| `selected_route_id`   | Unique route identifier           | String/ID |
| `duration_in_seconds` | Current real-time travel duration | Integer   |
| `avg_static_duration` | Historical average duration       | Float     |

## Analysis Opportunities

With this data, you can:

1. **Calculate Deviation**: `(duration_in_seconds - avg_static_duration) / avg_static_duration * 100`
2. **Identify Congestion**: Routes where real-time > historical average
3. **Performance Metrics**: Track route efficiency over time
4. **Alert Systems**: Flag routes with significant deviations

## Notes

- The query shows all routes without filtering, providing a comprehensive view
- Time-based matching ensures data relevance and accuracy
- Results are suitable for real-time dashboards and monitoring systems
