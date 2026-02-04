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
// limitations under the License.import { City } from "../../types/city"
import { DEMO_CITIES } from "./demo-cities"

// This file is now deprecated - cities are managed through the app store
// For demo mode, use DEMO_CITIES directly from "./demo-cities"

// Export DEMO_CITIES for backward compatibility
export const AVAILABLE_CITIES: Record<string, City> = DEMO_CITIES

// Export functions for backward compatibility (they do nothing)
export const getCitiesVersion = (): number => 0
export const incrementCitiesVersion = (): void => {}
export const refreshAvailableCities = (): Record<string, City> => DEMO_CITIES
