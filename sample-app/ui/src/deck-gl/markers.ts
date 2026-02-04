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

export const alertMarkerSVG = (color: string, scale: number) => {
  const diameter = scale * 2
  const radius = 10 // Keep radius the same
  const strokeWidth = Math.max(1, scale * 0.1) // Reduced stroke width for more inner space

  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="${diameter}" height="${diameter}" viewBox="0 0 24 24">
    <!-- Red circle with white border and proportional stroke width -->
    <circle cx="12" cy="12" r="${radius}" fill="${color}" stroke="white" stroke-width="${strokeWidth}" />
  </svg>`
}

export const pinMarkerSVG = (color: string, scale: number) => {
  const size = scale * 2.5

  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size * 1.5}" viewBox="0 0 15 25" version="1.1" id="marker">
    <path 
      fill="${color}" 
      d="M7.5,0C5.0676,0,2.2297,1.4865,2.2297,5.2703C2.2297,7.8378,6.2838,13.5135,7.5,15c1.0811-1.4865,5.2703-7.027,5.2703-9.7297C12.7703,1.4865,9.9324,0,7.5,0z"
      transform="scale(${scale / 10})" />
  </svg>`
}

export const svgUrl = (svgString: string) => {
  return `data:image/svg+xml;base64,${btoa(svgString)}`
}
