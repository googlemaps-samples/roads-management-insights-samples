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

/**
 * Simple in-memory cache for API responses
 * Caches data based on a key for the duration of the session
 */

interface CacheEntry<T> {
  data: T
  timestamp: number
}

class APICache {
  private cache: Map<string, CacheEntry<unknown>> = new Map()
  private readonly TTL = 5 * 60 * 1000 // 5 minutes default TTL

  /**
   * Generate a cache key from parameters
   */
  generateKey(params: Record<string, unknown>): string {
    return JSON.stringify(params, (_, value) => {
      // Handle Date objects
      if (value instanceof Date) {
        return value.toISOString()
      }
      // Sort object keys for consistent stringification
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return Object.keys(value)
          .sort()
          .reduce((sorted: Record<string, unknown>, key) => {
            sorted[key] = (value as Record<string, unknown>)[key]
            return sorted
          }, {})
      }
      return value
    })
  }

  /**
   * Get cached data if it exists and is not expired
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) {
      return null
    }

    // Check if cache entry is expired
    const now = Date.now()
    if (now - entry.timestamp > this.TTL) {
      this.cache.delete(key)
      return null
    }

    return entry.data as T
  }

  /**
   * Store data in cache
   */
  set<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    })
  }

  /**
   * Clear specific cache entry
   */
  delete(key: string): void {
    this.cache.delete(key)
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Clear expired entries
   */
  clearExpired(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.TTL) {
        this.cache.delete(key)
      }
    }
  }
}

// Singleton instance
export const apiCache = new APICache()

// Periodic cleanup of expired entries (every 5 minutes)
if (typeof window !== "undefined") {
  setInterval(
    () => {
      apiCache.clearExpired()
    },
    5 * 60 * 1000,
  )
}
