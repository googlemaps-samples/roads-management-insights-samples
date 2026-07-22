// Copyright 2026 Google LLC
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

/** Outer ring of {@link WORLD_JURISDICTION_GEO_JSON} (lng, lat). */
const WORLD_POLYGON_OUTER_RING: ReadonlyArray<readonly [number, number]> = [
  [-180, -90],
  [180, -90],
  [180, 90],
  [-180, 90],
  [-180, -90],
]

function ringMatchesWorldOuterRing(ring: number[][] | undefined): boolean {
  if (!ring || ring.length !== WORLD_POLYGON_OUTER_RING.length) return false
  return ring.every((pt, i) => {
    const w = WORLD_POLYGON_OUTER_RING[i]
    return (
      pt.length >= 2 &&
      Math.abs(pt[0] - w[0]) < 1e-6 &&
      Math.abs(pt[1] - w[1]) < 1e-6
    )
  })
}

/** True when the GeoJSON is the standard whole-world jurisdiction polygon (no custom boundary). */
export function isWorldJurisdictionGeoJson(geojson: unknown): boolean {
  if (!geojson || typeof geojson !== "object") return false
  const g = geojson as { type?: string }

  if (g.type === "FeatureCollection") {
    const fc = geojson as GeoJSON.FeatureCollection
    const first = fc.features?.[0]
    if (first?.geometry?.type === "Polygon") {
      return ringMatchesWorldOuterRing(first.geometry.coordinates?.[0])
    }
    return false
  }

  if (g.type === "Feature") {
    const f = geojson as GeoJSON.Feature
    if (f.geometry?.type === "Polygon") {
      return ringMatchesWorldOuterRing(f.geometry.coordinates?.[0])
    }
    return false
  }

  if (g.type === "Polygon") {
    const p = geojson as GeoJSON.Polygon
    return ringMatchesWorldOuterRing(p.coordinates?.[0])
  }

  return false
}

/** WGS84 polygon covering the full globe (multi-tenant default jurisdiction). */
export const WORLD_JURISDICTION_GEO_JSON: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [WORLD_POLYGON_OUTER_RING.map(([a, b]) => [a, b])],
      },
    },
  ],
}
