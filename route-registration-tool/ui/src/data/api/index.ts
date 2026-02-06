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

// Re-export all API modules
export { projectsApi } from "./projects-api"
export { routesApi } from "./routes-api"
export { roadsApi } from "./roads-api"
export { polygonsApi } from "./polygons-api"
export { googleRoutesApi } from "./google-routes-api"
export { placesApi } from "./places-api"
export { pubsubApi } from "./pubsub-api"
export { usersApi } from "./users-api"
export { bigqueryApi } from "./bigquery-api"

// Re-export API types
export type {
  ApiResponse,
  PaginatedResponse,
  RouteSaveRequest,
  RouteSaveResponse,
} from "../api-types"
