# Data Analytics (Use Case 2) - Calculation Methodology

This document explains the detailed calculations used in the Data Analytics system, covering historical data filtering, delay metrics, route statistics, and comprehensive traffic analysis.

## Table of Contents

1. [Average Delay Calculation](#1-average-delay-calculation)
2. [Data Filtering](#2-data-filtering)
3. [Finding Number of Delayed Routes](#3-finding-number-of-delayed-routes)
4. [Average Delay and Delay Percentage of Each Route](#4-average-delay-and-delay-percentage-of-each-route)
5. [Average Delay of Complete Route](#5-average-delay-of-complete-route)
6. [Average Delay Hourly](#6-average-delay-hourly)
7. [Route Coloring Logic](#7-route-coloring-logic)

---

## 1. Average Delay Calculation

The system calculates multiple types of average delays to provide comprehensive traffic insights.

### Core Delay Metrics

#### **Individual Record Delay**

```
FOR each traffic record:
  delayRatio = actualDuration / staticDuration
  delayTime = actualDuration - staticDuration
  delayPercentage = ((actualDuration - staticDuration) / staticDuration) * 100
```

#### **Route-Level Average Delay**

```
FUNCTION calculateRouteAverages(filteredData):
  routeStats = {}

  FOR each record in filteredData:
    routeId = record.routeId
    delayRatio = record.duration / record.staticDuration
    delayTime = record.duration - record.staticDuration

    // Initialize route stats if first time
    IF routeId NOT in routeStats:
      routeStats[routeId] = {totalDuration: 0, totalStaticDuration: 0,
                           totalDelayRatio: 0, delayTime: 0, count: 0}

    // Accumulate route statistics
    routeStats[routeId].totalDuration += record.duration
    routeStats[routeId].totalStaticDuration += record.staticDuration
    routeStats[routeId].totalDelayRatio += delayRatio
    routeStats[routeId].delayTime += delayTime
    routeStats[routeId].count += 1

  // Calculate averages for each route
  FOR each routeId in routeStats:
    routeStats[routeId].avgDelayRatio = routeStats[routeId].totalDelayRatio / routeStats[routeId].count
    routeStats[routeId].avgDelayTime = routeStats[routeId].delayTime / routeStats[routeId].count

  RETURN routeStats
```

#### **Network-Wide Average Delay**

```
FUNCTION calculateNetworkAverages(routeStats):
  totalDelayRatio = 0
  totalDelayTime = 0
  totalRecords = 0

  FOR each route in routeStats:
    totalDelayRatio += route.totalDelayRatio
    totalDelayTime += route.delayTime
    totalRecords += route.count

  avgDelayRatio = totalDelayRatio / totalRecords
  avgDelayPercentage = (avgDelayRatio - 1) * 100
  avgDelayTime = totalDelayTime / totalRecords

  RETURN {avgDelayRatio, avgDelayPercentage, avgDelayTime}
```

### Delay Calculation Process

1. **Individual Record Processing**:

   - Calculate delay ratio for each traffic record
   - Compute absolute delay time in seconds
   - Determine delay percentage

2. **Route Aggregation**:

   - Sum all delay metrics per route
   - Calculate route-specific averages
   - Track record counts for statistical validity

3. **Network Aggregation**:
   - Aggregate all route delays
   - Calculate network-wide averages
   - Provide comprehensive delay statistics

---

## 2. Data Filtering

The system applies comprehensive filtering to ensure data quality and relevance for analytics calculations.

### Core Filtering Criteria

```
FUNCTION filterData(rawData, routeIds, timeFilters):
  filteredData = []

  FOR each record in rawData:
    // Extract and validate duration data
    duration = parseToNumber(record.duration_in_seconds)
    staticDuration = parseToNumber(record.static_duration_in_seconds)

    // Apply data quality filters
    IF duration is invalid OR staticDuration is invalid OR staticDuration <= 0:
      SKIP record

    // Apply route validation
    IF record.routeId NOT in validRouteIds:
      SKIP record

    // Apply time range filtering
    IF record.timestamp NOT within timeFilters.range:
      SKIP record

    // Record passes all filters
    ADD record to filteredData

  RETURN filteredData
```

### Filtering Process

1. **Data Quality Validation**:

   - Valid numeric values for duration and static duration
   - Positive static duration values
   - No NaN or null values

2. **Route Selection**:

   - Only routes present in real-time data
   - Enabled segments for the selected city
   - Valid route IDs

3. **Time Range Filtering**:

   - Date range validation (custom or predefined periods)
   - Hour range filtering (e.g., rush hours only)
   - Timezone-aware filtering

4. **Geographic Filtering**:
   - City-specific route filtering
   - Enabled route segments only

---

## 3. Finding Number of Delayed Routes

The system identifies and counts routes experiencing significant delays based on configurable thresholds.

### Delayed Route Identification

```
FUNCTION identifyDelayedRoutes(routeStats):
  // Sort routes by delay severity (highest first)
  sortedRoutes = SORT routeStats BY delayRatio DESCENDING

  // Apply filtering criteria for significant delays
  significantlyDelayedRoutes = []
  FOR each route in sortedRoutes:
    IF route.delayRatio > 1.5 AND        // 50%+ slower than baseline
       route.delayTime > 5 AND           // More than 5 seconds delay
       route.staticDuration > 5:         // Route must be meaningful length

      ADD route to significantlyDelayedRoutes

  // Count all routes with any delay
  allDelayedRoutes = []
  FOR each route in routeStats:
    IF route.delayRatio > 1:             // Any delay above baseline
      ADD route to allDelayedRoutes

  RETURN {
    significantlyDelayed: significantlyDelayedRoutes,
    totalDelayedCount: LENGTH(allDelayedRoutes),
    significantDelayedCount: LENGTH(significantlyDelayedRoutes)
  }
```

### Delay Thresholds

| Threshold Type         | Value                 | Purpose                             |
| ---------------------- | --------------------- | ----------------------------------- |
| **Significant Delay**  | `delayRatio > 1.5`    | Routes 50%+ slower than baseline    |
| **Minimum Delay Time** | `delayTime > 5s`      | Absolute delay must be meaningful   |
| **Route Length**       | `staticDuration > 5s` | Route must have sufficient baseline |
| **Any Delay**          | `delayRatio > 1.0`    | Routes slower than free-flow        |

### Counting Process

1. **Route Classification**:

   - Identify routes meeting delay criteria
   - Sort by delay severity (highest first)
   - Apply multiple threshold filters

2. **Statistical Counting**:

   - Count significantly delayed routes
   - Count all delayed routes (any delay)
   - Calculate delay percentages

3. **Quality Assurance**:
   - Ensure minimum data requirements
   - Validate route significance
   - Filter out invalid records

---

## 4. Average Delay and Delay Percentage of Each Route

The system provides detailed delay metrics for individual routes to enable route-specific analysis.

### Route-Specific Calculations

```typescript
// Source: ui/src/data/historical/data.ts
interface RouteDelayData {
  routeId: string
  delayTime: number // Average delay time in seconds
  delayRatio: number // Average delay ratio
  staticDuration: number // Baseline duration
  averageDuration: number // Average actual duration
  delayPercentage: number // Delay percentage
  count: number // Number of records
  peakCongestionHourRange: string
  peakCongestionLevel: number
}

// Calculate route-specific averages
const routeStats = {
  delayRatio: totalDelayRatio / count,
  delayTime: totalDelayTime / count,
  delayPercentage: (totalDelayRatio / count - 1) * 100,
  averageDuration: totalDuration / count,
  staticDuration: totalStaticDuration / count,
}
```

### Route Metrics Calculation

1. **Individual Route Processing**:

   - Aggregate all records for each route
   - Calculate route-specific averages
   - Track peak congestion periods

2. **Delay Percentage Calculation**:

   ```typescript
   const delayPercentage = (delayRatio - 1) * 100
   ```

3. **Peak Congestion Analysis**:
   - Identify hour with highest delay ratio
   - Calculate peak congestion level
   - Determine peak hour range

### Route Ranking and Display

```typescript
// Sort routes by delay severity
const sortedRoutes = routes.sort((a, b) => b.delayRatio - a.delayRatio)

// Display format
const displayFormat = {
  delayTime: `${route.delayTime.toFixed(0)}s`,
  delayPercentage: `${Math.round(route.delayPercentage)}%`,
  delayRatio: route.delayRatio.toFixed(2),
}
```

---

## 5. Average Delay of Complete Route

The system calculates comprehensive delay metrics for complete route networks and individual routes.

### Complete Route Network Analysis

```typescript
// Source: ui/src/data/historical/data.ts
// Calculate network-wide averages
const networkStats = {
  totalRoutes: allRouteIds.length,
  delayedRoutes: delayedRoutesCount,
  avgDelayRatio: totalDelayRatio / totalRecords,
  avgDelayTime: totalDelayTime / totalRecords,
  avgDelayPercentage: (totalDelayRatio / totalRecords - 1) * 100,
}

// Calculate per-route averages
allRouteIds.forEach((routeId) => {
  const routeData = routeStats.get(routeId)
  if (routeData && routeData.count > 0) {
    routeData.avgDelayRatio = routeData.totalDelayRatio / routeData.count
    routeData.avgDelayTime = routeData.delayTime / routeData.count
    routeData.avgDelayPercentage = (routeData.avgDelayRatio - 1) * 100
  }
})
```

### Route Completion Analysis

1. **Network-Wide Metrics**:

   - Total number of routes analyzed
   - Average delay across all routes
   - Network reliability indicators

2. **Individual Route Completion**:

   - Complete delay profile per route
   - Average performance over time period
   - Route-specific reliability metrics

3. **Statistical Aggregation**:
   - Weighted averages by route usage
   - Confidence intervals for delay estimates
   - Data quality indicators

---

## 6. Average Delay Hourly

The system provides detailed hourly analysis of delay patterns to identify traffic trends and peak congestion periods.

### Hourly Delay Calculation

```typescript
// Source: ui/src/data/historical/graph/hourly-stats.tsx
// Initialize hourly data structure
const hourlyData = new Map()
for (let hour = 0; hour < 24; hour++) {
  hourlyData.set(hour, {
    totalDelayRatio: 0,
    totalCurrentDuration: 0,
    totalStaticDuration: 0,
    count: 0,
  })
}

// Process records by hour
filteredData.forEach((record) => {
  const hour = getHourFromRecord(record.record_time)
  const delayRatio = duration / staticDuration

  const hourData = hourlyData.get(hour)
  hourData.totalDelayRatio += delayRatio
  hourData.totalCurrentDuration += duration
  hourData.totalStaticDuration += staticDuration
  hourData.count += 1
})

// Calculate hourly averages
for (let hour = 0; hour < 24; hour++) {
  const data = hourlyData.get(hour)
  if (data.count > 0) {
    const avgDelayRatio = data.totalDelayRatio / data.count
    const avgCurrentDuration = data.totalCurrentDuration / data.count
    const avgStaticDuration = data.totalStaticDuration / data.count
    const congestionLevel = Math.max(0, (avgDelayRatio - 1) * 100)
    const averageDelay = avgCurrentDuration - avgStaticDuration
  }
}
```

### Hourly Analysis Features

1. **24-Hour Pattern Analysis**:

   - Delay ratios for each hour (0-23)
   - Congestion level percentages
   - Average delay times per hour

2. **Peak Hour Identification**:

   ```typescript
   // Track peak congestion
   if (averageDelayRatio > peakCongestionLevel) {
     peakCongestionLevel = averageDelayRatio
     peakCongestionHour = hour
   }
   ```

3. **Route-Specific Hourly Data**:
   ```typescript
   // Route-specific hourly tracking
   const routeHourly = routeHourlyData.get(routeId)
   if (routeHourly && staticDuration > 0) {
     const routeHourData = routeHourly.get(hour)
     if (routeHourData) {
       routeHourData.totalDelayRatio += delayRatio
       routeHourData.count += 1
     }
   }
   ```

### Hourly Metrics Output

```typescript
interface HourlyCongestionResultData {
  hour: number
  congestionLevel: number // Percentage delay
  avgDelayRatio: number // Average delay ratio
  avgCurrentDuration: number // Average actual duration
  avgStaticDuration: number // Average baseline duration
  recordCount: number // Number of records
  averageDelay: number // Average delay in seconds
}
```

---

## Key Insights

### What Makes Data Analytics Valuable?

1. **Historical Perspective**: Analysis of traffic patterns over time
2. **Route-Specific Insights**: Individual route performance metrics
3. **Temporal Analysis**: Hourly and daily traffic patterns
4. **Network-Wide View**: Complete traffic system analysis

### Key Performance Indicators

1. **Delay Severity**: Routes with delay ratios > 1.5 (50%+ slower)
2. **Peak Congestion**: Hours with highest delay ratios
3. **Route Reliability**: Consistent performance over time
4. **Network Efficiency**: Overall system delay metrics

### Data Quality Assurance

- **Validation**: Comprehensive data filtering and validation
- **Statistical Significance**: Minimum record counts for reliable averages
- **Error Handling**: Graceful degradation for missing data
- **Performance**: Optimized calculations for large datasets

---

## 7. Route Coloring Logic

The system applies visual color coding to routes based on their delay performance to provide immediate visual feedback about traffic conditions.

### Color Assignment Algorithm

```typescript
// Source: ui/src/data/common/route-color.ts
export const getRouteColor = (
  delayRatio: number,
  delayTime?: number,
): string => {
  // Handle invalid values
  if (!delayRatio || isNaN(delayRatio) || delayRatio <= 0) {
    return "#9E9E9E" // Grey for no historical data
  }

  if (delayTime && delayTime <= 0.5) {
    return "#13d68f" // Green for normal (0-20% slower)
  }

  if (delayRatio >= 1.75) {
    return "#a82726" // Dark red for very high delay (75% or more slower)
  } else if (delayRatio >= 1.5) {
    return "#f24d42" // Red for high delay (50% or more slower)
  } else if (delayRatio > 1.2) {
    return "#ffcf44" // Yellow for medium delay (20-50% slower)
  } else {
    return "#13d68f" // Green for normal (0-20% slower)
  }
}
```

### Color Categories and Thresholds

| Color        | Hex Code  | Condition       | Delay Ratio Range             | Description                  |
| ------------ | --------- | --------------- | ----------------------------- | ---------------------------- |
| **Grey**     | `#9E9E9E` | No data         | `≤ 0` or invalid              | No historical data available |
| **Green**    | `#13d68f` | Normal          | `≤ 1.2` or `delayTime ≤ 0.5s` | 0-20% slower than baseline   |
| **Yellow**   | `#ffcf44` | Medium delay    | `1.2 < delayRatio < 1.5`      | 20-50% slower than baseline  |
| **Red**      | `#f24d42` | High delay      | `1.5 ≤ delayRatio < 1.75`     | 50-75% slower than baseline  |
| **Dark Red** | `#a82726` | Very high delay | `≥ 1.75`                      | 75%+ slower than baseline    |

### Historical Route Coloring Process

```typescript
// Source: ui/src/data/common/geojson-processor.ts
// Calculate delay metrics for each route
const delayRatio = staticDuration > 0 ? duration / staticDuration : 1
const delayTime = duration - staticDuration
const delayPercentage =
  staticDuration > 0 ? ((duration - staticDuration) / staticDuration) * 100 : 0

// Apply color based on calculated metrics
const color = getRouteColor(delayRatio, delayTime)
```

### Color Assignment for Data Analytics

1. **Historical Route Coloring**:

   ```typescript
   // Routes are colored based on averaged historical delay ratios
   const historicalDelayRatio = routeStats.totalDelayRatio / routeStats.count
   const routeColor = getRouteColor(historicalDelayRatio, routeStats.delayTime)
   ```

2. **Route Segment Coloring**:

   - Each route segment gets individual color based on its delay performance
   - Colors represent the average delay over the selected time period
   - Visual consistency maintained across the network

3. **Dynamic Color Updates**:
   - Colors update when time filters change
   - Real-time color adjustments based on current data
   - Smooth transitions between color states

### Color Logic for Different Data Types

#### **Real-time Routes**

```typescript
// Current traffic conditions
const currentDelayRatio = currentDuration / staticDuration
const currentDelayTime = currentDuration - staticDuration
const realtimeColor = getRouteColor(currentDelayRatio, currentDelayTime)
```

#### **Historical Routes**

```typescript
// Averaged historical performance
const historicalDelayRatio = totalDelayRatio / recordCount
const historicalDelayTime = totalDelayTime / recordCount
const historicalColor = getRouteColor(historicalDelayRatio, historicalDelayTime)
```

#### **Route-Specific Analysis**

```typescript
// Individual route coloring for detailed analysis
const routeSpecificColor = getRouteColor(
  routeData.avgDelayRatio,
  routeData.avgDelayTime,
)
```

### Visual Indicators and User Experience

1. **Color Consistency**:

   - Same color scheme across all views
   - Consistent thresholds for all route types
   - Intuitive color progression (green → yellow → red)

2. **Accessibility**:

   - High contrast colors for visibility
   - Color-blind friendly palette
   - Alternative indicators for color-blind users

3. **Interactive Elements**:
   - Hover effects for route details
   - Click interactions for route selection
   - Tooltip information with delay metrics

### Color Application in Data Analytics

```typescript
// Apply colors to route segments in the map
const coloredRoutes = routes.map((route) => ({
  ...route,
  color: getRouteColor(route.delayRatio, route.delayTime),
  delayPercentage: (route.delayRatio - 1) * 100,
  visualIndicator: {
    severity:
      route.delayRatio >= 1.75
        ? "critical"
        : route.delayRatio >= 1.5
          ? "high"
          : route.delayRatio >= 1.2
            ? "medium"
            : "low",
  },
}))
```

### Color-Based Analytics Insights

1. **Traffic Pattern Recognition**:

   - Green routes: Reliable, consistent performance
   - Yellow routes: Moderate delays, potential bottlenecks
   - Red routes: High delays, significant congestion
   - Dark red routes: Critical delays, major traffic issues

2. **Network Health Assessment**:

   - Overall color distribution indicates network health
   - Color clustering shows problem areas
   - Temporal color changes reveal traffic patterns

3. **Decision Support**:
   - Visual route selection for planning
   - Color-coded route recommendations
   - Immediate visual feedback for route choices

This route coloring logic ensures that users can quickly identify traffic conditions and make informed decisions based on visual cues that correspond directly to the calculated delay metrics.

---

This calculation methodology ensures accurate, comprehensive traffic analytics that help users understand historical traffic patterns, identify problematic routes, and make data-driven transportation decisions.
