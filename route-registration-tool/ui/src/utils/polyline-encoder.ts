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

const encodeNumber = (num: number): string => {
  let value = num
  let encoded = ""
  while (value >= 0x20) {
    encoded += String.fromCharCode((0x20 | (value & 0x1f)) + 63)
    value >>= 5
  }
  encoded += String.fromCharCode(value + 63)
  return encoded
}

const encodeSignedNumber = (num: number): string => {
  let sgnNum = num << 1
  if (num < 0) {
    sgnNum = ~sgnNum
  }
  return encodeNumber(sgnNum)
}

export const encodePolyline = (coordinates: [number, number][]): string => {
  let lastLat = 0
  let lastLng = 0
  let result = ""

  coordinates.forEach(([lng, lat]) => {
    const latE5 = Math.round(lat * 1e5)
    const lngE5 = Math.round(lng * 1e5)

    const deltaLat = latE5 - lastLat
    const deltaLng = lngE5 - lastLng

    result += encodeSignedNumber(deltaLat)
    result += encodeSignedNumber(deltaLng)

    lastLat = latE5
    lastLng = lngE5
  })

  return result
}
