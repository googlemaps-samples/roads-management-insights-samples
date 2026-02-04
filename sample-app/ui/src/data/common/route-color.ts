// Copyright 2025 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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
    return "#a82726" // Dark red for very high delay (100% or more slower)
  } else if (delayRatio >= 1.5) {
    return "#f24d42" // Red for high delay (50% or more slower)
  } else if (delayRatio > 1.2) {
    return "#ffcf44" // Yellow for medium delay (20-50% slower)
  } else {
    return "#13d68f" // Green for normal (0-20% slower)
  }
}
