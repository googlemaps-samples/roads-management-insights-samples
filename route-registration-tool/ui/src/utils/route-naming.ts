// ui/src/utils/route-naming.ts

/**
 * Generate route name for multi-select combined routes
 * @param roadCount Number of roads in the combined route
 * @returns Formatted route name
 */
export function generateMultiSelectRouteName(roadCount: number): string {
  if (roadCount === 1) {
    return "Route"
  }
  return `Route (${roadCount} roads)`
}

/**
 * Generate route name for stretched routes
 * @param roadName Original road name
 * @returns Formatted route name
 */
export function generateStretchRouteName(roadName: string): string {
  if (!roadName || roadName.trim() === "") {
    return "Stretched Route"
  }
  return `Stretched Route - ${roadName}`
}
