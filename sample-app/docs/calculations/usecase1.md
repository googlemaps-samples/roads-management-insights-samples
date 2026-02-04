# Route Reliability Analysis (Use Case 1) - Calculation Methodology

This document explains the detailed calculations used in the Route Reliability analysis system, covering route colors, delay metrics, and severe congestion detection.

## Table of Contents
1. [Delay Metrics Calculation](#1-delay-metrics-calculation)
2. [Route Color Assignment](#2-route-color-assignment)
3. [Severe Congestion Detection](#3-severe-congestion-detection)
4. [Data Processing Pipeline](#4-data-processing-pipeline)

---

## 1. Delay Metrics Calculation

The system calculates several key metrics to quantify traffic delays and reliability.

### Core Metrics

#### **Delay Ratio**
```
delayRatio = actualDuration / staticDuration
```
- **Purpose**: Shows how much slower current travel is compared to free-flow conditions
- **Range**: `≥ 1.0` (1.0 = no delay, >1.0 = delayed)
- **Example**: `1.5` means 50% slower than free-flow

#### **Delay Time**
```
delayTime = actualDuration - staticDuration
```
- **Purpose**: Absolute additional time due to congestion (in seconds)
- **Range**: `≥ 0` seconds
- **Example**: `300` seconds = 5 minutes additional delay

#### **Delay Percentage**
```
delayPercentage = ((actualDuration - staticDuration) / staticDuration) * 100
```
- **Purpose**: Percentage increase in travel time due to congestion
- **Range**: `≥ 0%` (0% = no delay, >0% = delayed)
- **Example**: `50%` means 50% longer than expected

### Real-time Metrics Processing

For real-time route reliability analysis, metrics are calculated from current traffic conditions:

```
FOR each route segment:
  // Calculate delay metrics
  IF staticDuration > 0:
    delayRatio = duration / staticDuration
    delayPercentage = ((duration - staticDuration) / staticDuration) * 100
  ELSE:
    delayRatio = 1
    delayPercentage = 0
  
  delayTime = duration - staticDuration
  
  // Assign color based on delay metrics
  color = getRouteColor(delayRatio, delayTime)
```

---

## 2. Route Color Assignment

Route colors are determined based on **delay ratio** and **delay time** to provide visual indicators of traffic conditions.

### Color Mapping Logic

```
FUNCTION getRouteColor(delayRatio, delayTime):
  // Handle invalid or missing data
  IF delayRatio is invalid OR delayRatio <= 0:
    RETURN grey color
  
  // Handle minimal delays
  IF delayTime exists AND delayTime <= 0.5 seconds:
    RETURN green color
  
  // Apply delay-based color logic
  IF delayRatio >= 1.75:
    RETURN dark red color    // Very high delay (75%+ slower)
  ELSE IF delayRatio >= 1.5:
    RETURN red color         // High delay (50-75% slower)
  ELSE IF delayRatio > 1.2:
    RETURN yellow color      // Medium delay (20-50% slower)
  ELSE:
    RETURN green color       // Normal (0-20% slower)
```

### Color Categories

| Color | Hex Code | Condition | Delay Ratio Range | Description |
|-------|----------|-----------|-------------------|-------------|
| **Grey** | `#9E9E9E` | No data | `≤ 0` or invalid | No data available |
| **Green** | `#13d68f` | Normal | `≤ 1.2` or `delayTime ≤ 0.5s` | 0-20% slower than baseline |
| **Yellow** | `#ffcf44` | Medium delay | `1.2 < delayRatio < 1.5` | 20-50% slower than baseline |
| **Red** | `#f24d42` | High delay | `1.5 ≤ delayRatio < 1.75` | 50-75% slower than baseline |
| **Dark Red** | `#a82726` | Very high delay | `≥ 1.75` | 75%+ slower than baseline |

### Color Assignment Process

1. **Real-time Routes**: Colors assigned based on current `delayRatio` and `delayTime`
2. **Fallback**: Routes with invalid data display as grey

---

## 3. Severe Congestion Detection

Severe congestion is identified through multiple criteria to ensure accurate detection of problematic traffic conditions.

### Alert Creation Criteria

Routes are flagged as "severe congestion" and marked with alert icons when they meet **ALL** of the following conditions:

```
FUNCTION identifySevereCongestion(routes):
  severeRoutes = []
  
  FOR each route in routes:
    IF route has valid delayPercentage AND
       route.delayPercentage > 100 AND        // 100%+ slower than baseline
       route has valid delayTime AND
       route.delayTime > 30 AND               // More than 30 seconds delay
       route has valid staticDuration AND
       route.staticDuration > 5:              // Route must be meaningful length
      
      ADD route to severeRoutes
  
  RETURN severeRoutes
```

### Severe Congestion Thresholds

| Metric | Threshold | Purpose |
|--------|-----------|---------|
| **Delay Percentage** | `> 100%` | At least 100% slower than free-flow conditions |
| **Delay Time** | `> 30 seconds` | Absolute delay must be significant |
| **Static Duration** | `> 5 seconds` | Route must have meaningful baseline duration |

### Alert Ranking and Display

1. **Sorting**: Alerts sorted by delay percentage (highest first)
2. **Limitation**: Maximum 10 alerts displayed to avoid map clutter
3. **Positioning**: Alert markers placed at route midpoint for visibility

### Visual Indicators

- **Alert Icons**: Red circular markers (`#e94436`) on severely congested routes
- **Route Colors**: Dark red (`#a82726`) for routes with `delayRatio ≥ 1.75`
- **Tooltips**: Show detailed delay information on hover/click

---

## 4. Data Processing Pipeline

### Real-time Data Processing

```
PROCESS realTimeData:
  FOR each route in realTimeData:
    // Calculate current delay metrics
    delayRatio = currentDuration / staticDuration
    delayPercentage = ((currentDuration - staticDuration) / staticDuration) * 100
    delayTime = currentDuration - staticDuration
    
    // Assign visual indicators
    color = getRouteColor(delayRatio, delayTime)
    
    // Check for severe congestion alerts
    IF meetsSevereCongestionCriteria(route):
      ADD alert marker to route
```

### Data Processing Pipeline

1. **Live Data Ingestion**: Process current traffic data from real-time sources
2. **Route Analysis**: Calculate current delay metrics for each route segment
3. **Color Assignment**: Apply colors based on current delay ratios
4. **Alert Detection**: Identify routes with severe current congestion
5. **Route Reliability Assessment**: Determine reliability status for planning

### Performance Optimizations

- **Real-time Processing**: Efficient calculation of current metrics
- **Data Structures**: Use Maps and Sets for O(1) lookups
- **Memory Management**: Optimized data structures for live updates
- **Rendering**: Efficient map rendering with Deck.gl

### Data Quality Assurance

- **Validation**: Check for valid numeric values and positive durations
- **Fallbacks**: Default values for missing or invalid data
- **Error Handling**: Graceful degradation when data is unavailable

---

## Key Insights

### What Makes a Route "Reliable"?

1. **Current Performance**: Low delay ratios in real-time conditions
2. **Manageable Delays**: Current delay ratios below 1.5 (50% slower)
3. **No Severe Congestion**: Not flagged as having severe delays

### What Indicates "Unreliable" Routes?

1. **High Current Delays**: Real-time delay ratios above 1.5 (50% slower)
2. **Severe Congestion**: Current delay ratios above 1.75 (75% slower)
3. **Alert Conditions**: Routes meeting severe congestion criteria

### Real-time Planning Considerations

- **Current Conditions**: Based on live traffic data
- **Immediate Reliability**: Real-time assessment for current travel
- **Alert Awareness**: Identification of routes to avoid right now

This calculation methodology ensures accurate, reliable traffic analysis that helps users make informed decisions about route planning and traffic management.
