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

import { useEffect, useState } from "react"

/**
 * Custom hook for creating a pulsating animation effect
 *
 * @param isActive Whether the animation should be active
 * @param minValue Minimum value of the pulse (default: 0.8)
 * @param maxValue Maximum value of the pulse (default: 1.2)
 * @param speed Speed of the animation in ms (default: 60)
 * @param increment Amount to increment per step (default: 0.04)
 * @returns Current pulse value between minValue and maxValue
 */
export function usePulseAnimation(
  isActive: boolean,
  minValue = 0.8,
  maxValue = 1.2,
  speed = 60,
  increment = 0.04,
): number {
  const [pulseValue, setPulseValue] = useState<number>(1.0)
  const [pulseDirection, setPulseDirection] = useState<number>(1)

  useEffect(() => {
    // Reset to default when not active
    if (!isActive) {
      setPulseValue(1.0)
      return
    }

    // Set up animation interval
    const animationFrame = setInterval(() => {
      setPulseValue((prevValue) => {
        let newValue = prevValue + pulseDirection * increment

        // Change direction when reaching bounds
        if (newValue >= maxValue) {
          setPulseDirection(-1)
          newValue = maxValue
        } else if (newValue <= minValue) {
          setPulseDirection(1)
          newValue = minValue
        }

        return newValue
      })
    }, speed)

    // Clean up interval on unmount or when dependencies change
    return () => clearInterval(animationFrame)
  }, [isActive, pulseDirection, minValue, maxValue, speed, increment])

  return pulseValue
}
