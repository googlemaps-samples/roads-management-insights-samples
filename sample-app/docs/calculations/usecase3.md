# Route Reliability Analysis (Use Case 3) - Calculation Methodology

This document explains the detailed calculations used in the Route Reliability Analysis system, covering travel time metrics, congestion analysis, and reliability indices for transportation planning.

## Table of Contents

1. [Average Travel Time](#1-average-travel-time)
2. [Peak Congestion Percentage](#2-peak-congestion-percentage)
3. [Hourly Travel Time](#3-hourly-travel-time)
4. [95% Reliable Time](#4-95-reliable-time)

---

## 1. Average Travel Time

The system calculates comprehensive average travel time metrics to understand typical traffic conditions and route performance.

### Core Travel Time Calculations

#### **Individual Route Average Travel Time**

```
FUNCTION calculateRouteAverageTravelTime(routeData):
  totalTravelTime = 0
  recordCount = 0

  FOR each record in routeData:
    totalTravelTime += record.duration
    recordCount += 1

  averageTravelTime = totalTravelTime / recordCount
  RETURN averageTravelTime
```

#### **Network-Wide Average Travel Time**

```
FUNCTION calculateNetworkAverageTravelTime(hourlyData):
  networkAverages = {}

  FOR each hour from 0 to 23:
    totalDuration = 0
    totalCount = 0

    FOR each route in hourlyData[hour]:
      totalDuration += route.totalDuration
      totalCount += route.count

    IF totalCount > 0:
      networkAverages[hour] = totalDuration / totalCount
    ELSE:
      networkAverages[hour] = 0

  RETURN networkAverages
```

### Travel Time Calculation Process

1. **Data Aggregation**:

   ```
   FUNCTION aggregateTravelTimeData(hourlyData):
     FOR each hour from 0 to 23:
       travelTimes = []
       freeFlowTimes = []

       FOR each dayData in hourlyData[hour]:
         IF dayData.totalDuration > 0 AND dayData.totalStaticDuration > 0:
           ADD dayData.totalDuration to travelTimes
           ADD dayData.totalStaticDuration to freeFlowTimes

       hourlyData[hour].travelTimes = travelTimes
       hourlyData[hour].freeFlowTimes = freeFlowTimes
   ```

2. **Average Calculation**:

   ```
   FUNCTION calculateHourlyAverages(hourlyData):
     FOR each hour from 0 to 23:
       IF hourlyData[hour].travelTimes.length > 0:
         averageTravelTime = SUM(hourlyData[hour].travelTimes) / LENGTH(hourlyData[hour].travelTimes)
         averageFreeFlowTime = SUM(hourlyData[hour].freeFlowTimes) / LENGTH(hourlyData[hour].freeFlowTimes)
       ELSE:
         averageTravelTime = 0
         averageFreeFlowTime = 0
   ```

3. **Route-Specific Averages**:

   ```
   FUNCTION calculateRouteSpecificAverages(allRouteIds, hourlyData):
     routeHourlyAverages = {}

     FOR each routeId in allRouteIds:
       routeHourlyAverages[routeId] = {}

       FOR each hour from 0 to 23:
         routeData = getRouteDataForHour(routeId, hour)
         IF routeData.count > 0:
           avgTime = routeData.totalDuration / routeData.count
         ELSE:
           avgTime = 0

         routeHourlyAverages[routeId][hour] = avgTime

     RETURN routeHourlyAverages
   ```

### Travel Time Metrics

| Metric                     | Description                             | Calculation                           | Units           |
| -------------------------- | --------------------------------------- | ------------------------------------- | --------------- |
| **Average Travel Time**    | Mean travel time across all records     | `sum(travelTimes) / count`            | Seconds/Minutes |
| **Free Flow Time**         | Baseline travel time without congestion | `sum(staticDurations) / count`        | Seconds/Minutes |
| **Route-Specific Average** | Average travel time per route per hour  | `routeTotalDuration / routeCount`     | Seconds/Minutes |
| **Network Average**        | Overall network average travel time     | `networkTotalDuration / networkCount` | Seconds/Minutes |

---

## 2. Peak Congestion Percentage

The system identifies and quantifies peak congestion periods to understand traffic patterns and bottlenecks.

### Peak Congestion Calculation

#### **Congestion Level Identification**

```
FUNCTION identifyPeakCongestion(hourlyData):
  peakCongestionHour = 0
  peakCongestionLevel = 0

  FOR each hour in hoursToConsider:
    hourData = hourlyData[hour]

    IF hourData exists AND hourData.travelTimes.length > 0:
      // Calculate average delay ratio for this hour
      totalDelayRatio = 0
      FOR each delayRatio in hourData.delayRatios:
        totalDelayRatio += delayRatio

      averageDelayRatio = totalDelayRatio / LENGTH(hourData.delayRatios)

      // Track peak congestion
      IF averageDelayRatio > peakCongestionLevel:
        peakCongestionLevel = averageDelayRatio
        peakCongestionHour = hour

  RETURN {peakCongestionHour, peakCongestionLevel}
```

#### **Congestion Percentage Calculation**

```
FUNCTION calculateCongestionPercentages(averageDelayRatio, peakCongestionLevel):
  // Convert delay ratio to percentage
  congestionPercentage = MAX(0, (averageDelayRatio - 1) * 100)

  // Peak congestion percentage
  peakCongestionPercentage = MAX(0, (peakCongestionLevel - 1) * 100)

  RETURN {congestionPercentage, peakCongestionPercentage}
```

### Peak Congestion Analysis Process

1. **Hourly Congestion Tracking**:

   ```typescript
   // Track congestion for each hour
   const hourlyCongestion = new Map<
     number,
     { totalDelayRatio: number; count: number }
   >()

   filteredData.forEach((record) => {
     const hour = getHourFromRecord(record.record_time)
     const delayRatio = duration / staticDuration

     const hourData = hourlyCongestion.get(hour)
     if (hourData) {
       hourData.totalDelayRatio += delayRatio
       hourData.count += 1
     }
   })
   ```

2. **Peak Hour Identification**:

   ```typescript
   // Find hour with highest congestion
   let maxCongestion = 0
   let peakHour = 0

   for (let hour = 0; hour < 24; hour++) {
     const hourData = hourlyCongestion.get(hour)
     if (hourData && hourData.count > 0) {
       const avgDelayRatio = hourData.totalDelayRatio / hourData.count
       if (avgDelayRatio > maxCongestion) {
         maxCongestion = avgDelayRatio
         peakHour = hour
       }
     }
   }
   ```

3. **Congestion Severity Classification**:

   ```typescript
   const getCongestionSeverity = (delayRatio: number) => {
     if (delayRatio >= 1.75) return "Critical" // 75%+ slower
     if (delayRatio >= 1.5) return "High" // 50-75% slower
     if (delayRatio >= 1.2) return "Medium" // 20-50% slower
     if (delayRatio >= 1.0) return "Low" // 0-20% slower
     return "No Congestion"
   }
   ```

### Peak Congestion Metrics

| Metric                         | Description                   | Calculation                                  | Range |
| ------------------------------ | ----------------------------- | -------------------------------------------- | ----- |
| **Peak Congestion Hour**       | Hour with highest delay ratio | Hour with max `averageDelayRatio`            | 0-23  |
| **Peak Congestion Level**      | Highest delay ratio observed  | `max(averageDelayRatio)`                     | ≥ 1.0 |
| **Peak Congestion Percentage** | Peak congestion as percentage | `(peakCongestionLevel - 1) * 100`            | ≥ 0%  |
| **Average Congestion**         | Overall congestion level      | `(totalDelayRatio / totalRecords - 1) * 100` | ≥ 0%  |

---

## 3. Hourly Travel Time

The system provides detailed hourly travel time analysis to identify traffic patterns throughout the day.

### Hourly Travel Time Calculation

#### **24-Hour Travel Time Analysis**

```typescript
// Source: ui/src/data/historical/data.ts
const hourlyAverageTravelTime = new Map<number, number>()
const hourlyFreeFlowTime = new Map<number, number>()

for (let hour = 0; hour < 24; hour++) {
  const hourData = hourlyData.get(hour)

  if (hourData && hourData.size > 0) {
    const travelTimes: number[] = []
    const freeFlowTimes: number[] = []

    // Extract all travel times for this hour
    for (const dayData of hourData.values()) {
      if (dayData.totalDuration > 0 && dayData.totalStaticDuration > 0) {
        travelTimes.push(dayData.totalDuration)
        freeFlowTimes.push(dayData.totalStaticDuration)
      }
    }

    // Calculate hourly averages
    const averageTravelTime =
      travelTimes.reduce((sum, time) => sum + time, 0) / travelTimes.length
    const averageFreeFlowTime =
      freeFlowTimes.reduce((sum, time) => sum + time, 0) / freeFlowTimes.length

    hourlyAverageTravelTime.set(hour, averageTravelTime)
    hourlyFreeFlowTime.set(hour, averageFreeFlowTime)
  } else {
    // No data for this hour
    hourlyAverageTravelTime.set(hour, 0)
    hourlyFreeFlowTime.set(hour, 0)
  }
}
```

#### **Route-Specific Hourly Travel Times**

```typescript
// Source: ui/src/components/selected-route-segment-graph.tsx
const routeMetricsData = useMemo(() => {
  const hourlyAverageTravelTime = new Map<number, number>()

  for (let hour = 0; hour < 24; hour++) {
    // Get average travel time for this specific route at this hour
    const avgTravelTime = finalRouteAvgTimes.get(hour) || 0
    hourlyAverageTravelTime.set(hour, avgTravelTime)
  }

  return {
    routeId: selectedRouteId,
    hourlyAverageTravelTime,
    hourlyFreeFlowTime,
    hourly95thPercentile,
    hourlyPlanningTimeIndex,
  }
}, [selectedRouteId, routeHourlyAverages, routeMetrics])
```

### Hourly Analysis Features

1. **Complete 24-Hour Coverage**:

   ```typescript
   // Initialize all 24 hours
   for (let hour = 0; hour < 24; hour++) {
     hourlyAverageTravelTime.set(hour, 0)
     hourlyFreeFlowTime.set(hour, 0)
   }
   ```

2. **Data Quality Validation**:

   ```typescript
   // Validate data before processing
   if (travelTimes.length === 0 || freeFlowTimes.length === 0) {
     hourlyAverageTravelTime.set(hour, 0)
     hourlyFreeFlowTime.set(hour, 0)
     continue
   }
   ```

3. **Time Pattern Recognition**:

   ```typescript
   // Identify rush hour patterns
   const rushHours = [7, 8, 9, 17, 18, 19] // Morning and evening rush
   const isRushHour = rushHours.includes(hour)

   // Calculate rush hour vs off-peak differences
   const rushHourTravelTime = getAverageForHours(rushHours)
   const offPeakTravelTime = getAverageForOffPeakHours()
   ```

### Hourly Travel Time Metrics

| Metric                         | Description                   | Calculation                          | Purpose                  |
| ------------------------------ | ----------------------------- | ------------------------------------ | ------------------------ |
| **Hourly Average Travel Time** | Mean travel time per hour     | `sum(hourTravelTimes) / count`       | Identify peak hours      |
| **Hourly Free Flow Time**      | Baseline time per hour        | `sum(hourStaticTimes) / count`       | Compare against baseline |
| **Rush Hour Travel Time**      | Average during peak hours     | `sum(rushHourTimes) / rushHourCount` | Peak period analysis     |
| **Off-Peak Travel Time**       | Average during non-peak hours | `sum(offPeakTimes) / offPeakCount`   | Baseline comparison      |

---

## 4. 95% Reliable Time

The system calculates the 95th percentile travel time to provide reliable planning times that account for traffic variability.

### 95th Percentile Calculation

#### **Core 95th Percentile Algorithm**

```
FUNCTION calculatePercentile(sortedArray, percentile):
  IF sortedArray.length == 0:
    RETURN 0

  index = (percentile / 100) * (sortedArray.length - 1)
  lower = FLOOR(index)
  upper = CEIL(index)
  weight = index % 1

  IF upper >= sortedArray.length:
    RETURN sortedArray[sortedArray.length - 1]

  RETURN sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight

FUNCTION calculate95thPercentile(travelTimes):
  sortedTravelTimes = SORT travelTimes ASCENDING
  hour95thPercentileValue = calculatePercentile(sortedTravelTimes, 95)
  RETURN hour95thPercentileValue
```

#### **Planning Time Index Calculation**

```
FUNCTION calculatePlanningTimeIndex(travelTimes, freeFlowTimes):
  // Calculate 95th percentile
  percentile95 = calculate95thPercentile(travelTimes)

  // Calculate averages
  avgTravelTime = SUM(travelTimes) / LENGTH(travelTimes)
  avgFreeFlowTime = SUM(freeFlowTimes) / LENGTH(freeFlowTimes)

  // Calculate Planning Time Index (PTI)
  IF avgFreeFlowTime > 0:
    planningTimeIndex = percentile95 / avgFreeFlowTime
  ELSE:
    planningTimeIndex = 0

  RETURN planningTimeIndex
```

### 95% Reliable Time Process

1. **Data Collection and Sorting**:

   ```typescript
   // Collect all travel times for the hour
   const travelTimes: number[] = []
   for (const dayData of hourData.values()) {
     if (dayData.totalDuration > 0) {
       travelTimes.push(dayData.totalDuration)
     }
   }

   // Sort for percentile calculation
   const sortedTravelTimes = [...travelTimes].sort((a, b) => a - b)
   ```

2. **Percentile Calculation**:

   ```typescript
   // Calculate 95th percentile
   const percentile95 = calculatePercentile(sortedTravelTimes, 95)

   // Store in hourly map
   hourly95thPercentile.set(hour, percentile95)
   ```

3. **Reliability Index Calculation**:

   ```typescript
   // Calculate Planning Time Index
   const planningTimeIndex = percentile95 / averageFreeFlowTime

   // Store reliability metrics
   hourlyPlanningTimeIndex.set(hour, planningTimeIndex)
   ```

### Route-Specific 95th Percentile

```typescript
// Source: ui/src/components/selected-route-segment-graph.tsx
// Get per-route 95th percentile metrics
const perRoute95th =
  routeMetrics.perRouteMetrics?.hourly95thPercentile?.get(selectedRouteId)
const perRouteFreeFlow =
  routeMetrics.perRouteMetrics?.hourlyFreeFlowTime?.get(selectedRouteId)

// Calculate route-specific planning index
for (let hour = 0; hour < 24; hour++) {
  const freeFlow = perRouteFreeFlow.get(hour) || 0
  const percentile95 = perRoute95th.get(hour) || 0
  const planningIndex = freeFlow > 0 ? percentile95 / freeFlow : 0

  hourly95thPercentile.set(hour, percentile95)
  hourlyPlanningTimeIndex.set(hour, planningIndex)
}
```

### 95% Reliable Time Metrics

| Metric                          | Description                               | Calculation                               | Purpose                |
| ------------------------------- | ----------------------------------------- | ----------------------------------------- | ---------------------- |
| **95th Percentile Travel Time** | Time that 95% of trips are faster than    | `percentile(sortedTravelTimes, 95)`       | Reliable planning time |
| **Planning Time Index (PTI)**   | 95th percentile relative to free flow     | `95thPercentile / averageFreeFlowTime`    | Reliability measure    |
| **Travel Time Index (TTI)**     | Average travel time relative to free flow | `averageTravelTime / averageFreeFlowTime` | Congestion measure     |
| **Reliability Buffer**          | Extra time needed for 95% reliability     | `95thPercentile - averageTravelTime`      | Planning buffer        |

### Reliability Interpretation

| PTI Range     | Reliability Level    | Planning Recommendation                 |
| ------------- | -------------------- | --------------------------------------- |
| **1.0 - 1.2** | High Reliability     | Use average travel time + 10% buffer    |
| **1.2 - 1.5** | Moderate Reliability | Use 95th percentile for planning        |
| **1.5 - 2.0** | Low Reliability      | Use 95th percentile + additional buffer |
| **> 2.0**     | Very Low Reliability | Consider alternative routes or times    |

---

## Key Insights

### What Makes Route Reliability Analysis Valuable?

1. **Planning Accuracy**: 95th percentile times provide reliable planning estimates
2. **Traffic Pattern Recognition**: Hourly analysis reveals peak and off-peak patterns
3. **Congestion Quantification**: Peak congestion percentages identify problem areas
4. **Route Comparison**: Average travel times enable route performance comparison

### Key Performance Indicators

1. **Reliability Metrics**: Planning Time Index (PTI) and Travel Time Index (TTI)
2. **Congestion Severity**: Peak congestion percentages and hourly patterns
3. **Planning Accuracy**: 95th percentile travel times for reliable estimates
4. **Route Performance**: Average travel times and reliability comparisons

### Data Quality Assurance

- **Statistical Validity**: Minimum record counts for reliable percentile calculations
- **Time Coverage**: Complete 24-hour analysis with data validation
- **Route Coverage**: Per-route metrics for detailed analysis
- **Error Handling**: Graceful degradation for missing or invalid data

This calculation methodology ensures accurate, reliable route analysis that helps users make informed decisions about route planning, departure times, and transportation reliability assessment.
