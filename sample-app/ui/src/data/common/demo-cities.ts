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
import { City } from "../../types/city"
import { Usecase } from "../../types/common"

// Demo cities data - shared across the application
export const DEMO_CITIES: Record<string, City> = {
  paris: {
    id: "paris",
    name: "Paris",
    coords: { lat: 48.8609, lng: 2.3242 },
    subTitle: "Boulevard Périphérique (ring road) with Connecting Ramps",
    availableDateRanges: {
      startDate: new Date(2025, 6, 23, 0, 0, 0),
      endDate: new Date(2025, 7, 20, 23, 59, 59),
    },
    liveDataDate: new Date(2025, 7, 20, 9, 0, 0),
    zoom: 12.3,
    useCases: ["realtime-monitoring"] as Usecase[],
    timezone: "Europe/Paris",
  },
  tokyo: {
    id: "tokyo",
    name: "Tokyo",
    subTitle: "Major Arterial Roads and Highways",
    coords: { lat: 35.6969, lng: 139.7594 },
    availableDateRanges: {
      startDate: new Date(2025, 6, 24, 0, 0, 0),
      endDate: new Date(2025, 7, 21, 23, 59, 59),
    },
    liveDataDate: new Date(2025, 7, 22, 16, 0, 0),
    zoom: 11.5,
    useCases: ["realtime-monitoring"] as Usecase[],
    timezone: "Asia/Tokyo",
  },
  boston: {
    id: "boston",
    name: "Boston",
    coords: { lat: 42.35855752418282, lng: -71.06669477966506 },
    availableDateRanges: {
      startDate: new Date(2025, 8, 24, 0, 0, 0),
      endDate: new Date(2025, 9, 7, 9, 0, 0),
    },
    liveDataDate: new Date(2025, 9, 8, 8, 30, 0),
    zoom: 14.3,
    boundaryType: "postal_code",
    useCases: ["data-analytics"] as Usecase[],
    timezone: "America/New_York",
  },
  gurgaon: {
    id: "gurgaon",
    name: "Gurgaon",
    coords: { lat: 28.473900330178687, lng: 77.04997832673128 },
    availableDateRanges: {
      startDate: new Date(2025, 7, 20, 0, 0, 0),
      endDate: new Date(2025, 8, 4, 23, 59, 59),
    },
    liveDataDate: new Date(2025, 8, 10, 11, 0, 0),
    zoom: 13,
    boundaryType: "postal_code",
    useCases: ["data-analytics"] as Usecase[],
    timezone: "Asia/Kolkata",
  },
  rome: {
    id: "rome",
    name: "Rome",
    subTitle: "Sightseeing Corridors",
    coords: {
      lat: 41.8780807261643,
      lng: 12.538448394691342,
    },
    availableDateRanges: {
      startDate: new Date(2025, 9, 15, 0, 0, 0),
      endDate: new Date(2025, 10, 4, 9, 0, 0),
    },
    liveDataDate: new Date(2025, 9, 16, 8, 30, 0),
    zoom: 10.318941713090046,
    useCases: ["route-reliability"] as Usecase[],
    timezone: "Europe/Rome",
    landmarks: [
      {
        name: "The Colosseum",
        position: [12.492231, 41.890251],
      },
      {
        name: "Ostia Antica",
        position: [12.319268434609263, 41.81418963819434],
      },
      {
        name: "Tivoli",
        position: [12.79694, 41.96065],
      },
      {
        name: "Castel Gandolfo",
        position: [12.643376398436041, 41.74253085463044],
      },
      {
        name: "Cerveteri",
        position: [12.09137, 42.00084],
      },
    ],
  },
  newyork: {
    id: "newyork",
    name: "New York",
    subTitle: "Airport Corridors",
    coords: {
      lat: 40.68481374814115,
      lng: -73.97514824845528,
    },
    availableDateRanges: {
      startDate: new Date(2025, 9, 15, 0, 0, 0),
      endDate: new Date(2025, 10, 4, 0, 0, 0),
    },
    liveDataDate: new Date(2025, 9, 16, 6, 0, 0),
    zoom: 10.440277781825014,
    boundaryType: "postal_code",
    useCases: ["route-reliability"] as Usecase[],
    timezone: "America/New_York",
    landmarks: [
      {
        name: "Times Square",
        position: [-73.9855, 40.758],
      },
      {
        name: "LaGuardia Airport",
        position: [-73.873966, 40.776927],
      },
      {
        name: "Newark Liberty International Airport",
        position: [-74.174462, 40.689531],
      },
      {
        name: "John F. Kennedy International Airport",
        position: [-73.7781, 40.6413],
      },
    ],
  },
}
