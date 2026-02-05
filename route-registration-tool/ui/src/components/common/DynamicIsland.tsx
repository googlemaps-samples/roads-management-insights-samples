import { Delete, Edit, EditLocationAlt } from "@mui/icons-material"
import {
  Box,
  CircularProgress,
  Fade,
  Paper,
  Slide,
  Typography,
} from "@mui/material"
import React, { useEffect, useMemo, useRef, useState } from "react"

import { PRIMARY_BLUE } from "../../constants/colors"
import { useLassoRoadSelection, usePolygonHandlers } from "../../hooks"
import { useMessageStore, useProjectWorkspaceStore } from "../../stores"
import { useLayerStore } from "../../stores/layer-store"
import { useUserPreferencesStore } from "../../stores/user-preferences-store"
import { convertKmToMiles, useDistanceUnit } from "../../utils/distance-utils"
import { calculateRouteLengthFromPolyline } from "../../utils/polyline-decoder"
import {
  pxToMuiSpacing,
  useResponsiveTypography,
} from "../../utils/typography-utils"

import "../../styles/animations.css"

interface InstructionMessage {
  title: string
  description: string
  shortDescription: string // For minimized/collapsed view
  multiLineDescription?: string[] // For multi-line typewriter effect
  icon?: React.ReactNode
}

// Helper to parse text with **bold** markers
const parseFormattedText = (text: string) => {
  const parts: Array<{ text: string; bold: boolean }> = []
  const regex = /\*\*(.*?)\*\*/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    // Add text before the bold marker
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), bold: false })
    }
    // Add bold text
    parts.push({ text: match[1], bold: true })
    lastIndex = regex.lastIndex
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), bold: false })
  }

  // If no bold markers found, return the whole text as normal
  if (parts.length === 0) {
    parts.push({ text, bold: false })
  }

  return parts
}

const DynamicIsland: React.FC = () => {
  const typo = useResponsiveTypography()
  const {
    mapMode,
    selectedRoute,
    showIndividualMarkers,
    setDynamicIslandHeight,
    leftPanelExpanded,
    currentFolder,
    activePanel,
    selectedRoutePanelVisible,
    roadPriorityPanelOpen,
    priorityFilterPanelExpanded,
    routeNamingDialogOpen,
  } = useProjectWorkspaceStore()
  const islandRef = useRef<HTMLDivElement>(null)
  // Select only lengths to avoid infinite loops from array reference changes
  const routesCount = useProjectWorkspaceStore(
    (state) => state.routes?.length || 0,
  )
  const uploadedRoutesCount = useLayerStore(
    (state) => state.uploadedRoutes?.routes?.length || 0,
  )
  const polygonsCount = useLayerStore((state) =>
    state.polygonDrawing.completedPolygon ? 1 : 0,
  )
  const isPolygonDrawing = useLayerStore(
    (state) => state.polygonDrawing.isDrawing,
  )
  const selectedUploadedRouteId = useLayerStore(
    (state) => state.selectedUploadedRouteId,
  )
  const isAddingWaypoint = useLayerStore((state) => state.isAddingWaypoint)
  const isAddingIndividualWaypoint = useLayerStore(
    (state) => state.isAddingIndividualWaypoint,
  )
  // Use a boolean selector to prevent re-renders when route object reference changes
  // Only check if route exists, not the full object
  const hasGeneratedRoute = useLayerStore(
    (state) => !!state.individualRoute.generatedRoute,
  )
  const generatedRoute = useLayerStore(
    (state) => state.individualRoute.generatedRoute,
  )
  // Calculate route length from encoded polyline if available (more accurate)
  const routeLength = useMemo(() => {
    if (!generatedRoute?.encodedPolyline) {
      return generatedRoute?.distance ?? 0
    }
    return (
      calculateRouteLengthFromPolyline(generatedRoute.encodedPolyline) ??
      generatedRoute?.distance ??
      0
    )
  }, [generatedRoute?.encodedPolyline, generatedRoute?.distance])
  const distanceUnit = useDistanceUnit()
  const segmentationIsActive = useLayerStore(
    (state) => state.segmentation.isActive,
  )
  const segmentationType = useLayerStore((state) => state.segmentation.type)
  // Use length instead of full array to prevent re-renders on reference changes
  const segmentationPreviewSegmentsCount = useLayerStore(
    (state) => state.segmentation.previewSegments.length,
  )
  const lassoCompletedPolygon = useLayerStore(
    (state) => state.lassoDrawing.completedPolygon,
  )
  const lassoConfirmed = useLayerStore((state) => state.lassoDrawing.confirmed)
  const lassoIsDrawing = useLayerStore((state) => state.lassoDrawing.isDrawing)
  const selectedRoadPriorities = useLayerStore(
    (state) => state.selectedRoadPriorities,
  )
  const roadSelectionMode = useLayerStore(
    (state) => state.roadImport.selectionMode,
  )
  const roadImport = useLayerStore((state) => state.roadImport)
  const routeInMaking = useLayerStore((state) => state.roadImport.routeInMaking)
  const routeInMakingRoadIds = useLayerStore(
    (state) => state.roadImport.routeInMakingRoadIds,
  )
  const multiSelectValidationResult = useLayerStore(
    (state) => state.roadImport.multiSelectValidationResult,
  )
  const multiSelectValidating = useLayerStore(
    (state) => state.roadImport.multiSelectValidating,
  )
  const projectId = useProjectWorkspaceStore((state) => state.projectId)
  const pendingFile = useProjectWorkspaceStore((state) => state.pendingFile)
  const showInstructions = useUserPreferencesStore(
    (state) => state.show_instructions,
  )

  // Get ingestion state for polygon drawing
  const { isIngesting } = usePolygonHandlers()

  // Get road count for lasso selection (only when confirmed)
  const lassoRoadSelection = useLassoRoadSelection({
    projectId: projectId || undefined,
    polygon: lassoCompletedPolygon,
    priorities: selectedRoadPriorities,
    confirmed: lassoConfirmed,
  })
  const lassoRoadCount = lassoRoadSelection.data?.length || 0
  // Only consider a route selected if there are actually routes available
  // For uploaded routes, if selectedUploadedRouteId is set, consider it selected regardless of count
  // (SelectedRoutePanel visibility is the source of truth)
  const hasSelectedRoute =
    selectedUploadedRouteId !== null ||
    (selectedRoute !== null && (routesCount > 0 || uploadedRoutesCount > 0))
  const [isVisible, setIsVisible] = useState(true)
  const [currentMessage, setCurrentMessage] =
    useState<InstructionMessage | null>(null)
  const [displayedMultiLine, setDisplayedMultiLine] = useState<string[]>([])
  const messageSwitchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Get messages from message store (toast messages)
  const messages = useMessageStore((state) => state.messages)
  const latestMessage =
    messages.length > 0 ? messages[messages.length - 1] : null

  // Memoize the message calculation to prevent unnecessary re-renders
  const calculatedMessage = useMemo(() => {
    let message: InstructionMessage | null = null

    // Determine instruction type based on priority
    let instructionType: string

    // Priority 1: Route Naming Dialog is open (highest priority when open)
    if (routeNamingDialogOpen) {
      instructionType = "route_naming_dialog"
    } else if (pendingFile && mapMode === "upload_routes") {
      // Priority 1.5: File is being processed (show stable message to prevent flickering)
      instructionType = "processing_file"
    } else if (roadPriorityPanelOpen) {
      // Priority 2: Road Priority Panel is open
      instructionType = "road_priority_selection"
    } else if (isAddingWaypoint) {
      // Priority 2.5: Waypoint adding mode (active interaction - uploaded routes)
      instructionType = "adding_waypoint"
    } else if (isAddingIndividualWaypoint) {
      // Priority 2.6: Waypoint adding mode (active interaction - draw route)
      instructionType = "adding_individual_waypoint"
    } else if (
      mapMode !== "view" &&
      mapMode !== "individual_editing" &&
      mapMode !== "route_editing"
    ) {
      // Priority 3: Active map modes (upload_routes, individual_drawing, polygon_drawing, editing_uploaded_route, etc.)
      instructionType = mapMode
    } else if (selectedRoutePanelVisible && mapMode === "view") {
      // Priority 5: SelectedRoutePanel is visible (explicit state)
      // This is the most reliable way to detect when SelectedRoutePanel is shown
      instructionType = "editing_uploaded_route"
    } else if (hasSelectedRoute && mapMode === "view") {
      // Priority 6: Selected route editing (fallback for saved routes)
      // Check which type of route is selected:
      // - uploaded routes use selectedUploadedRouteId from layer-store
      // - saved routes use selectedRoute from project-workspace-store
      if (selectedRoute && !selectedUploadedRouteId) {
        // Saved route selected from LeftFloatingPanel (has selectedRoute but no selectedUploadedRouteId)
        instructionType = "viewing_saved_route"
      } else {
        // Default fallback
        instructionType = "editing_selected_route"
      }
    } else if (
      leftPanelExpanded &&
      mapMode === "view" &&
      !hasSelectedRoute &&
      !selectedRoutePanelVisible
    ) {
      // Priority 7: Routes/Folders panel expanded (only when in view mode and no route is selected)
      // Check which panel is active to show appropriate instructions
      if (activePanel === "uploaded_routes") {
        instructionType = "uploaded_routes_panel"
      } else {
        instructionType = "routes_panel_expanded"
      }
    } else if (
      routesCount === 0 &&
      uploadedRoutesCount === 0 &&
      mapMode === "view" &&
      !isAddingWaypoint
    ) {
      // Priority 8: Home view (no routes) - show getting started
      // Only show when in view mode, no routes exist, and panel is not expanded
      instructionType = "home_view"
    } else {
      // Default: Continue with mapMode-based messages
      instructionType = mapMode
    }

    // Switch case for all instruction types
    switch (instructionType) {
      case "route_naming_dialog":
        message = {
          title: "Configure Route Names",
          shortDescription:
            "Choose how to name your routes: use a feature property (if available) or enter a custom name. Each route will be numbered sequentially.",
          description:
            "Configure how your routes will be named. You can use a property from your GeoJSON features (if available), or enter a custom name. Routes will be numbered sequentially (e.g., My Route 1, My Route 2, etc.). Click Continue when you're ready.",
          multiLineDescription: [
            "Use a **feature property** or **custom name** - routes numbered sequentially",
            "Click **Continue** when ready",
          ],
        }
        break

      case "processing_file":
        message = {
          title: "Processing File",
          shortDescription:
            "Please wait while we analyze your file and extract route information.",
          description:
            "We're currently processing your uploaded file. This may take a few moments depending on the file size. Please wait while we analyze the file and extract route information.",
          multiLineDescription: [
            "**Analyzing** your uploaded file - this may take a moment",
          ],
          icon: <CircularProgress size={20} thickness={4} />,
        }
        break

      case "road_priority_selection":
        message = {
          title: "Select Road Priorities",
          shortDescription:
            "Choose which road priorities to import. Select categories or individual priorities, then confirm to import roads.",
          description:
            "Select the road priorities you want to import from the drawn polygon area. You can expand categories to see individual priorities, or select entire categories at once. Only roads matching your selected priorities will be imported. Click Confirm when you're ready.",
          multiLineDescription: [
            "Select **categories** or **individual priorities** - only matching roads will be imported",
            "Click **Confirm** when ready",
          ],
        }
        break

      case "home_view":
        message = {
          title: "Getting Started",
          shortDescription:
            "Click 'Add Routes' to upload routes, draw a new route, or import roads from an area.",
          description:
            "Welcome to your project workspace. Click the 'Add Routes' button to see options: From File (GeoJSON) (for GeoJSON files), Draw Route (to manually draw on the map), or Import Roads (to select an area and import all roads within it).",
          multiLineDescription: [
            "Click **Add Routes** to get started - choose: **From File (GeoJSON)**, **Draw Route**, or **Import Roads**",
          ],
        }
        break

      case "routes_panel_expanded":
        // Show different messages based on whether we're viewing folders or routes inside a folder
        if (currentFolder) {
          // Inside a folder - show route-specific instructions
          message = {
            title: "Routes in Folder",
            shortDescription:
              "Click any route to view details, edit, or navigate to it. Use 'Select' to batch move or delete multiple routes.",
            description:
              "You're viewing routes in this folder. Click any route to view its details, edit it, or navigate to it on the map. Use the 'Select' button to select multiple routes and batch move them to another folder or delete them. Click the menu (⋮) on any route for more options like editing or viewing the original uploaded route.",
            multiLineDescription: [
              "**Click** any route to view or edit - use **Select** for batch operations",
              "**Move** or **delete** multiple routes",
            ],
          }
        } else {
          // Outside - viewing folders
          message = {
            title: "Your Routes",
            shortDescription:
              "Browse your routes organized by folders. Click any folder to view its routes, or use the search to find specific folders.",
            description:
              "Browse your routes organized by folders. Each folder groups related routes together. Click any folder to view the routes inside it. Use the search bar to quickly find folders by name. Routes without a folder appear in the 'Untagged' folder.",
            multiLineDescription: [
              "**Click** any folder to view routes - **search** to find specific folders",
              "Routes are grouped by **folders**",
            ],
          }
        }
        break

      case "uploaded_routes_panel":
        // This case is only reached when panel is expanded AND no route is selected
        // (hasSelectedRoute check in priority logic ensures this)
        message = {
          title: "Uploaded Routes",
          shortDescription:
            "Review your uploaded routes with distance and match %. Select a route to edit or add waypoints. Create return routes directly from each route item.",
          description:
            "Your uploaded routes are displayed here with their Google-optimized versions. Each route shows distance and match percentage. Select a route to review it in detail, add waypoints, or swap start/end points. You can create return routes directly from each route item. Click save to choose a folder and save all routes.",
          multiLineDescription: [
            "• **Select** a route to edit or add waypoints - **create** a return route for each item",
            "• **Click save** to choose folder and save",
          ],
        }
        break

      case "adding_waypoint":
        message = {
          title: "Adding Waypoint",
          shortDescription: "Click on the map to add a waypoint",
          description: "Click on the map to add a waypoint",
          multiLineDescription: ["**Click** on the map to add a waypoint"],
        }
        break

      case "adding_individual_waypoint":
        message = {
          title: "Adding Waypoints",
          shortDescription:
            "Click on the map to add waypoints. Click Cancel when done.",
          description:
            "Click on the map to add waypoints to your route. You can add up to 25 waypoints. Click the Cancel button when you're done adding waypoints.",
          multiLineDescription: [
            "**Click** map to add waypoints (up to **25**) - click **Cancel** when done",
          ],
        }
        break

      case "viewing_saved_route":
        message = {
          title: "Viewing Your Route",
          shortDescription:
            "View route details including distance, type, status, and folder. Use the buttons to modify or delete the route.",
          description:
            "You're viewing a saved route. Route details including distance, type, status, folder, and segments (if applicable) are displayed in the panel on the right. You can rename the route using the Edit icon in the header, modify the route path, or delete it using the buttons at the bottom.",
          multiLineDescription: [
            "View route **details**: distance, type, status, folder - use buttons to **modify** or **delete** the route",
          ],
        }
        break

      case "editing_selected_route":
        message = {
          title: "Editing Your Route",
          shortDescription:
            "Make a route in reverse, flip your current route, or add waypoints to get a more accurate match.",
          description:
            "Make a route in reverse, flip your current route, or add waypoints to get a more accurate match.",
          multiLineDescription: [
            "**Reverse** route, **flip** it, or **add waypoints** for better match",
          ],
        }
        break

      case "editing_uploaded_route":
        message = {
          title: "Reviewing Uploaded Route",
          shortDescription:
            "Adjust your route to match your uploaded route, then save or discard when done.",
          description:
            "You're reviewing an uploaded route. Compare the Google-optimized route (purple when selected) with your original uploaded route (yellow). Adjust your route by adding waypoints, reordering them, or swapping start/end points to better match your uploaded route. When you're satisfied, click Save to apply changes or Discard to cancel.",
          multiLineDescription: [
            "Adjust your route to **match** your uploaded route - **Save** or **Discard** when done",
          ],
        }
        break

      case "individual_drawing":
        // Check if segmentation is active
        if (segmentationIsActive) {
          // Check if manual mode is selected
          if (segmentationType === "manual") {
            message = {
              title: "Manual Segmentation",
              shortDescription:
                "Click on the route to add cut points, or use Auto-Segment to segment at intersections automatically.",
              description:
                "In manual mode, you can click anywhere on the route where you want to create a segment boundary. Each click adds a cut point that splits the route into separate segments. Alternatively, use the Auto-Segment button to automatically segment the route at road intersections.",
              multiLineDescription: [
                "**Click** on route to add cut points, or use **Auto-Segment** button for automatic segmentation",
              ],
            }
          } else if (segmentationType === "distance") {
            // Distance segmentation mode
            message = {
              title: "Distance Segmentation",
              shortDescription:
                "Enter segment distance and click OK to generate segments.",
              description:
                "Enter the distance for each segment in the input field and click OK to generate segments. The route will be automatically divided into segments of the specified length.",
              multiLineDescription: [
                "**Enter** segment distance and click **OK** to generate segments",
              ],
            }
          } else {
            // General segmentation instructions (other modes)
            message = {
              title: "Segmenting Your Route",
              shortDescription:
                "Choose how to segment: Distance splits by segment length, or Manual lets you place cut points or use Auto-Segment button. Use the panel on the right to configure.",
              description:
                "Choose your segmentation method: Distance splits the route into segments of equal length, or Manual lets you place cut points manually or use the Auto-Segment button to segment at intersections automatically. Use the panel on the right to configure your segmentation.",
              multiLineDescription: [
                "Choose method: **Distance** or **Manual** - manual: place cut points or use **Auto-Segment** button",
                "Configure in the **right panel**",
              ],
            }
          }
        } else if (showIndividualMarkers) {
          // User is still in drawing stage (markers are visible)
          message = {
            title: "Drawing Your Route",
            shortDescription:
              "Add origin and destination first (2 clicks). Then click 'Add Waypoints' button to add more points. Drag points in the right panel to reorder.",
            description:
              "Click on the map twice to add your origin and destination points. To add waypoints between them, click the 'Add Waypoints' button in the right panel, then click on the map to place waypoints. You can add up to 25 waypoints. Drag points in the right panel to reorder them.",
            multiLineDescription: [
              "**Click** on map to add origin & destination - click **'Add Waypoints'** button, then click on map to add waypoints",
              "You can also **drag** the markers on the map",
            ],
          }
        } else if (hasGeneratedRoute) {
          // Check if route is ready (generated) but not segmented yet
          // If preview segments exist but segmentation is not active, user is likely saving after segmentation
          const hasPreviewSegments = segmentationPreviewSegmentsCount > 0
          if (hasPreviewSegments && !segmentationIsActive) {
            // User has configured segments and is saving
            message = {
              title: "Saving Your Route",
              shortDescription:
                "Enter a Route Name and select or create a folder to save your route and its segments. Use the panel on the right.",
              description:
                "Enter a Route Name for your route and select or create a folder to organize it. Each segment will be saved with your route. Use the panel on the right to enter these details.",
              multiLineDescription: [
                "Enter **Route Name** and **folder** - save route and segments in **right panel**",
              ],
            }
          } else {
            // Route is ready - can segment or save directly
            const isRouteOver80Km = routeLength >= 80
            const limitKm = 80
            const limitInUserUnit =
              distanceUnit === "miles" ? convertKmToMiles(limitKm) : limitKm
            const limitDisplay =
              distanceUnit === "miles"
                ? `${limitInUserUnit.toFixed(1)} mi`
                : `${limitKm} km`

            message = {
              title: "Route Ready",
              shortDescription: isRouteOver80Km
                ? `Your route exceeds ${limitDisplay} limit. Segment it to continue. When saving, enter a Route Name and select or create a folder in the panel on the right.`
                : "Your route is ready. Segment it or save it directly. When saving, enter a Route Name and select or create a folder in the panel on the right.",
              description: isRouteOver80Km
                ? `Your route exceeds ${limitDisplay} limit and cannot be saved as a single route. You must segment it to break it into smaller sections. When saving, you'll need to enter a Route Name and select or create a folder to organize your route. Use the panel on the right to segment your route.`
                : "Your route is ready. You can segment it to break it into smaller, manageable sections for better organization, or save it directly as one complete route. When saving, you'll need to enter a Route Name and select or create a folder to organize your route. Use the panel on the right to choose your action.",
              multiLineDescription: isRouteOver80Km
                ? [
                    `Route exceeds **${limitDisplay}** limit - **segment** it to continue`,
                    "Enter **Route Name** and **folder** in right panel",
                  ]
                : [
                    "Route is ready - **segment** it or **save** directly",
                    "Enter **Route Name** and **folder** in right panel",
                  ],
            }
          }
        } else {
          message = {
            title: "Drawing Your Route",
            shortDescription:
              "Click on the map to add origin and destination (2 points required). Then use 'Add Waypoints' button to add more.",
            description:
              "Start by clicking on the map twice to set your origin and destination points. Once you have both, you can click the 'Add Waypoints' button in the right panel to add waypoints between them. Waypoints help shape your route more precisely. Drag points in the right panel to reorder them.",
            multiLineDescription: [
              "**Click** map twice for origin & destination - use **'Add Waypoints'** button for more points",
              "**Drag** in right panel to reorder",
            ],
          }
        }
        break

      case "polygon_drawing":
        // Check if roads are being imported
        if (isIngesting) {
          message = {
            title: "Importing Roads",
            shortDescription:
              "Please wait while we import roads from the selected area. This may take a moment.",
            description:
              "We're currently importing roads from the selected polygon area. This process may take a few moments depending on the size of the area and the number of roads. Please wait while we process your selection.",
            multiLineDescription: [
              "**Importing** roads from selected area - this may take a moment",
            ],
            icon: <CircularProgress size={20} thickness={4} />,
          }
        } else {
          message = {
            title: "Selecting an Area",
            shortDescription:
              "You're drawing a polygon to import all roads in this area.",
            description:
              "You're currently selecting an area on the map. As you click to outline your polygon, all the roads that fall within this boundary will be automatically imported into your project. Take your time to carefully draw the area you want to cover. When you're done, double-click or press Enter to finish and see all the roads that match your selection.",
            multiLineDescription: [
              "**Click** map to draw polygon boundary - all roads will be **imported** automatically",
              "**Double-click** or **Enter** when finished",
            ],
          }
        }
        break

      case "lasso_selection":
        // Check if polygon is completed or still being drawn
        if (lassoCompletedPolygon) {
          // Polygon is completed, show instructions about selecting priorities
          const roadCountText = lassoRoadSelection.isFetching
            ? "**Loading** roads..."
            : `**${lassoRoadCount}** road${lassoRoadCount === 1 ? "" : "s"} match your filter`

          message = {
            title: "Select Road Priorities",
            shortDescription:
              "Choose which road priorities to include. Use the panel on the right to filter and save your selected roads.",
            description:
              "Your selection is complete. Now select which road priorities you want to include from the selected area. Use the panel on the right to expand categories, select priorities, and filter the roads. Once you've confirmed your selection, enter a folder and save all matching roads as routes.",
            multiLineDescription: [
              `Selection complete - ${roadCountText}`,
              "**Select** priorities in right panel - **select folder** and **save** when ready",
            ],
          }
        } else if (lassoIsDrawing) {
          // Still drawing the polygon
          message = {
            title: "Selecting Roads",
            shortDescription:
              "Click and drag to draw a freeform shape around the roads you want to select.",
            description:
              "You're selecting roads on the map. Click and drag to create a freeform shape around the roads you want to select. Click any point to complete the selection. All roads within your shape will be available for you to filter by priority and save as routes.",
            multiLineDescription: [
              "**Click and drag** to draw freeform shape - **click any point** to complete",
            ],
          }
        } else {
          // Lasso mode is active but not drawing yet
          message = {
            title: "Select Roads",
            shortDescription:
              "Click and drag on the map to draw a freeform shape around roads you want to select.",
            description:
              "Use Select Roads to choose roads by drawing a freeform shape on the map. Click and drag to create your selection area. Click any point to complete the selection. All roads within your shape will be displayed, and you can filter them by road priority before saving as routes.",
            multiLineDescription: [
              "**Click and drag** to draw freeform shape - **click any point** to complete",
              "**Filter** by priority and **save** as routes",
            ],
          }
        }
        break

      case "individual_editing":
        message = {
          title: "Adjusting Your Route",
          shortDescription: "You can drag any marker to adjust the route path.",
          description:
            "You're now editing your route. You can drag any marker to a new position and the route will automatically adjust to follow your changes. If you want to add more waypoints, simply click anywhere along the route line. Your route is flexible, so feel free to experiment until it follows exactly the path you envision.",
          multiLineDescription: [
            "**Drag** any marker to adjust route - **click** on route to add waypoints",
          ],
        }
        break

      case "route_editing":
        message = {
          title: "Refining Your Route",
          shortDescription:
            "You're fine-tuning waypoints to perfect your route.",
          description:
            "You're making changes to your route. Drag any waypoint to reposition it, or add new ones by clicking on the route. The system will recalculate the path as you work. Once you're happy with how the route looks, click 'Save' to commit your changes and make them permanent.",
          multiLineDescription: [
            "**Drag** waypoints to reposition - **click** route to add new waypoints",
            "**Save** when ready",
          ],
        }
        break

      case "segmentation":
        message = {
          title: "Breaking Down Your Route",
          shortDescription:
            "You're dividing your route into manageable segments.",
          description:
            "You're now segmenting your route into smaller sections. Click anywhere on the route to create a break point. Each segment becomes its own manageable piece that you can work with independently. This makes it easier to organize, modify, or analyze different parts of your route separately.",
          multiLineDescription: [
            "**Click** on route to create break points - each segment is manageable independently",
          ],
        }
        break

      case "upload_routes":
        // If file is being processed, don't show this message (processing_file takes priority)
        // If routes are already uploaded, show review message
        if (uploadedRoutesCount > 0) {
          message = {
            title: "Reviewing Your Routes",
            shortDescription:
              "See your uploaded routes on the left with distance and match %. Higher match % = closer to Google's route. Select any route to edit.",
            description:
              "See your uploaded routes on the left with distance and match %. Higher match % = closer to Google's route. Select any route to edit.",
            multiLineDescription: [
              "Review routes: **distance**, **match %** - higher match % = closer to Google's route",
              "**Select** any route to edit",
            ],
          }
        } else {
          // No routes uploaded yet, show upload instruction
          message = {
            title: "Uploading Routes",
            shortDescription: "Select a GeoJSON file to upload your routes.",
            description:
              "You're ready to upload routes. Select a GeoJSON file containing your route data. Once uploaded, your routes will be displayed on the map and optimized traffic-aware routes will be generated automatically for you to review and edit.",
            multiLineDescription: [
              "**Select** a GeoJSON file to upload - routes will be **optimized** automatically",
            ],
          }
        }
        break

      case "view":
      default:
        // Show different messages based on what's available
        // Note: hasSelectedRoute is already handled in priority 4 above
        // Note: home_view (no routes) is already handled in priority 1 above
        // Note: uploadedRoutesCount logic is handled in upload_routes case
        // Only show "Area Selection Complete" if polygon is completed AND not currently drawing AND importing
        if (polygonsCount > 0 && !isPolygonDrawing && isIngesting) {
          message = {
            title: "Area Selection Complete",
            shortDescription:
              "You've defined selection areas, and the roads within them will be imported.",
            description:
              "You've successfully created selection polygons on the map. The system is now processing these areas and will automatically import all the roads that fall within your selected boundaries. Once complete, these roads will be available in your project for you to manage and organize.",
            multiLineDescription: [
              "Selection polygons created - **processing** and **importing** roads",
              "Roads will be available soon",
            ],
          }
        } else if (mapMode === "road_selection") {
          // Road selection mode - check for different sub-states
          if (roadSelectionMode === "multi-select") {
            // Multi-select mode
            if (
              routeInMaking &&
              routeInMakingRoadIds &&
              routeInMakingRoadIds.length > 0
            ) {
              // Route in making exists
              const roadCount = routeInMakingRoadIds.length
              let validationText = ""

              if (multiSelectValidating) {
                validationText = "**Validating** route continuity..."
              } else if (multiSelectValidationResult) {
                if (multiSelectValidationResult.is_continuous) {
                  validationText = "✓ **Continuous** path - ready to save"
                } else {
                  const gaps = multiSelectValidationResult.gaps || []
                  if (gaps.length > 0) {
                    const gap = gaps[0]
                    validationText = `⚠ **Gap detected**: ${gap.distance_meters?.toFixed(1) || "unknown"}m between roads`
                  } else {
                    validationText = "⚠ **Disconnected** roads"
                  }
                }
              } else {
                validationText = "Building continuous route..."
              }

              message = {
                title: "Building Route",
                shortDescription: `You're building a route with ${roadCount} road${roadCount !== 1 ? "s" : ""}. ${validationText}`,
                description: `You're building a continuous route by selecting connected roads. Currently ${roadCount} road${roadCount !== 1 ? "s" : ""} selected. Click on roads that connect to the start or end of your current route to add them. Only roads that form a continuous path can be added. Use the controls to save or cancel.`,
                multiLineDescription: [
                  `${roadCount} road${roadCount !== 1 ? "s" : ""} selected - ${validationText}`,
                  "**Click** connected roads to add, or **Save** when ready",
                ],
              }
            } else {
              // Multi-select mode but no route in making yet
              message = {
                title: "Multi-Select Mode",
                shortDescription:
                  "Click on a road to start building your route. Only roads that form a continuous path can be added.",
                description:
                  "You're in multi-select mode. Click on any road to start building a continuous route. Once you've selected the first road, you can add more roads that connect to the start or end of your current route. Only roads that form a continuous path can be added. Use the controls to save your route or cancel.",
                multiLineDescription: [
                  "**Click** a road to start building route - only **continuous** paths can be added",
                  "**Save** or **Cancel** using controls",
                ],
              }
            }
          } else if (roadSelectionMode === "lasso") {
            // Lasso selection mode
            if (priorityFilterPanelExpanded) {
              message = {
                title: "Select Roads with Lasso",
                shortDescription:
                  "Draw a polygon on the map to select multiple roads at once. Use the Roads Priority panel to refine your selection.",
                description:
                  "You're in lasso selection mode. Click and drag on the map to draw a freeform polygon around the roads you want to select. All roads within your polygon will be highlighted. Use the Roads Priority panel on the left to filter roads by priority before selecting. Click any point to complete your selection.",
                multiLineDescription: [
                  "**Draw** polygon to select multiple roads - use **Roads Priority** panel to refine selection",
                  "**Click** any point to complete",
                ],
              }
            } else {
              message = {
                title: "Lasso Selection",
                shortDescription:
                  "Click and drag to draw a freeform shape around roads you want to select.",
                description:
                  "You're in lasso selection mode. Click and drag on the map to draw a freeform polygon around the roads you want to select. All roads within your polygon will be highlighted. Click any point to complete your selection.",
                multiLineDescription: [
                  "**Click and drag** to draw freeform shape",
                  "**Click** any point to complete",
                ],
              }
            }
          } else if (roadSelectionMode === "single") {
            // Single selection mode
            if (priorityFilterPanelExpanded) {
              message = {
                title: "Select Roads",
                shortDescription:
                  "Click on any road to select it, or switch to lasso or multi-select mode. Use the Roads Priority panel to filter roads by priority.",
                description:
                  "You can select roads in three ways: Click on any individual road to select it, switch to lasso mode to draw a polygon and select multiple roads at once, or use multi-select mode to build a continuous route. Use the Roads Priority panel on the left to filter roads by priority before selecting. Selected roads will be added to your project.",
                multiLineDescription: [
                  "**Click** any road to select, or **switch** to lasso or multi-select mode",
                  "Use **Roads Priority** panel to refine",
                ],
              }
            } else {
              message = {
                title: "Select Roads",
                shortDescription:
                  "Click on any road to select it. Use the controls to switch between single, lasso, or multi-select modes.",
                description:
                  "Click on any road to select it and add it to your project. Use the controls at the top to switch between single selection, lasso selection (draw polygon), or multi-select mode (build continuous routes). Selected roads will appear in the panel on the right.",
                multiLineDescription: [
                  "**Click** any road to select - **switch** modes using controls",
                  "Selected roads appear in **right panel**",
                ],
              }
            }
          } else {
            // Default road selection (no specific mode selected yet)
            message = {
              title: "Import Roads",
              shortDescription:
                "Select roads to import. Choose a selection mode: single, lasso, or multi-select.",
              description:
                "You're in road import mode. Select roads using one of three methods: single selection (click individual roads), lasso selection (draw a polygon), or multi-select (build continuous routes). Use the controls at the top to choose your selection mode.",
              multiLineDescription: [
                "Choose **selection mode**: single, lasso, or multi-select - **click** roads or **draw** polygon to select",
              ],
            }
          }
        } else {
          message = {
            title: "Exploring Your Routes",
            shortDescription:
              "Your routes are ready. Click on any route in the left panel to explore its details.",
            description:
              "You have routes in your project. They're all listed in the left panel, and each one tells its own story on the map. Click on any route to dive deeper into its details, see its properties, and make any adjustments you need. Your routes are waiting for you to explore and manage them.",
            multiLineDescription: [
              "Routes are ready - **click** any route in left panel to explore",
              "View details and make adjustments",
            ],
          }
        }
        break
    }

    return message
  }, [
    mapMode,
    routesCount,
    uploadedRoutesCount,
    polygonsCount,
    selectedRoute,
    selectedUploadedRouteId,
    hasSelectedRoute,
    isAddingWaypoint,
    isAddingIndividualWaypoint,
    hasGeneratedRoute,
    routeLength,
    distanceUnit,
    segmentationIsActive,
    segmentationType,
    segmentationPreviewSegmentsCount,
    showIndividualMarkers,
    leftPanelExpanded,
    currentFolder,
    activePanel,
    selectedRoutePanelVisible,
    roadPriorityPanelOpen,
    priorityFilterPanelExpanded,
    routeNamingDialogOpen,
    lassoCompletedPolygon,
    lassoIsDrawing,
    lassoRoadCount,
    lassoRoadSelection.isFetching,
    isIngesting,
    roadSelectionMode,
    isPolygonDrawing,
    routeInMaking,
    routeInMakingRoadIds?.length ?? 0,
    multiSelectValidationResult,
    multiSelectValidating,
    pendingFile,
  ])

  // Update current message only when calculated message changes
  useEffect(() => {
    // Clear any pending message switch timeout
    if (messageSwitchTimeoutRef.current) {
      clearTimeout(messageSwitchTimeoutRef.current)
      messageSwitchTimeoutRef.current = null
    }

    // Show instruction messages when:
    // 1. No toast message exists, OR
    // 2. RouteNamingDialog is open (dialog instructions take priority over toast)
    const shouldShowInstructions =
      (!latestMessage || routeNamingDialogOpen) && showInstructions

    if (shouldShowInstructions) {
      // Only update if message actually changed (deep comparison)
      const messageChanged =
        !currentMessage ||
        currentMessage.title !== calculatedMessage?.title ||
        currentMessage.shortDescription !==
          calculatedMessage?.shortDescription ||
        JSON.stringify(currentMessage.multiLineDescription) !==
          JSON.stringify(calculatedMessage?.multiLineDescription)

      if (messageChanged && calculatedMessage) {
        // If RouteNamingDialog is open, show instructions immediately (no delay)
        // Otherwise, add a small delay to prevent flickering when toast messages are dismissed quickly
        if (routeNamingDialogOpen) {
          setCurrentMessage(calculatedMessage)
          setIsVisible(true)
        } else {
          // If currentMessage is null (toast was just dismissed), show instructions immediately
          // Otherwise, add delay to prevent flickering
          if (!currentMessage) {
            setCurrentMessage(calculatedMessage)
            setIsVisible(true)
          } else {
            messageSwitchTimeoutRef.current = setTimeout(() => {
              setCurrentMessage(calculatedMessage)
              setIsVisible(true)
              messageSwitchTimeoutRef.current = null
            }, 300) // 300ms delay to prevent flickering
          }
        }
      } else if (!currentMessage && calculatedMessage) {
        // If no current message but we have a calculated message, show it immediately
        setCurrentMessage(calculatedMessage)
        setIsVisible(true)
      }
    } else if (!latestMessage && !showInstructions) {
      // Hide instructions if disabled
      if (currentMessage) {
        setCurrentMessage(null)
        setIsVisible(false)
        setDisplayedMultiLine([])
      }
    }

    return () => {
      if (messageSwitchTimeoutRef.current) {
        clearTimeout(messageSwitchTimeoutRef.current)
        messageSwitchTimeoutRef.current = null
      }
    }
  }, [
    latestMessage,
    showInstructions,
    calculatedMessage,
    currentMessage,
    routeNamingDialogOpen,
  ])

  // Handle toast messages - show them with priority over instruction messages
  // Toast messages should always show regardless of showInstructions preference
  // EXCEPT when RouteNamingDialog is open (dialog instructions take priority)
  useEffect(() => {
    // Clear any pending message switch timeout when toast appears
    if (messageSwitchTimeoutRef.current) {
      clearTimeout(messageSwitchTimeoutRef.current)
      messageSwitchTimeoutRef.current = null
    }

    // Don't show toast messages when RouteNamingDialog is open
    // The dialog instructions should take priority
    if (latestMessage && !routeNamingDialogOpen) {
      // Convert toast message to instruction message format
      const toastInstructionMessage: InstructionMessage = {
        title: getMessageTitle(latestMessage.type),
        shortDescription: latestMessage.message,
        description: latestMessage.description || latestMessage.message,
        multiLineDescription: latestMessage.description
          ? [latestMessage.message, latestMessage.description]
          : [latestMessage.message],
      }
      // Only update if message actually changed
      const messageChanged =
        !currentMessage ||
        currentMessage.title !== toastInstructionMessage.title ||
        currentMessage.shortDescription !==
          toastInstructionMessage.shortDescription ||
        JSON.stringify(currentMessage.multiLineDescription) !==
          JSON.stringify(toastInstructionMessage.multiLineDescription)

      if (messageChanged) {
        setCurrentMessage(toastInstructionMessage)
        setIsVisible(true)
      }
    } else if (latestMessage && routeNamingDialogOpen) {
      // Toast exists but dialog is open - clear toast message to show dialog instructions
      // The other effect will handle showing the dialog instructions
      if (
        currentMessage &&
        currentMessage.title === getMessageTitle(latestMessage.type)
      ) {
        setCurrentMessage(null)
      }
    } else if (!latestMessage && currentMessage) {
      // Toast was dismissed - check if current message is a toast message
      const isCurrentMessageToast =
        currentMessage.title === "Success" ||
        currentMessage.title === "Error" ||
        currentMessage.title === "Warning" ||
        currentMessage.title === "Info" ||
        currentMessage.title === "Loading"

      if (isCurrentMessageToast) {
        // Clear the toast message so instruction messages can show
        // Don't set isVisible to false - let the instruction message effect handle visibility
        setCurrentMessage(null)
        setDisplayedMultiLine([])
      }
      // The other effect will handle switching back to instruction messages with a delay
    }
  }, [latestMessage, currentMessage, routeNamingDialogOpen])

  // Helper function to get message title based on type
  const getMessageTitle = (type: string): string => {
    switch (type) {
      case "success":
        return "Success"
      case "error":
        return "Error"
      case "info":
        return "Info"
      case "warning":
        return "Warning"
      case "loading":
        return "Loading"
      default:
        return "Notification"
    }
  }

  // Helper function to get message color based on type
  const getMessageColor = (type: string): string => {
    switch (type) {
      case "success":
        return "#10b981" // green-500
      case "error":
        return "#ef4444" // red-500
      case "info":
        return "#3b82f6" // blue-500
      case "warning":
        return "#f59e0b" // amber-500
      case "loading":
        return PRIMARY_BLUE // blue
      default:
        return PRIMARY_BLUE
    }
  }

  // Helper function to get background color based on type (tinted version)
  const getMessageBackgroundColor = (type: string): string => {
    switch (type) {
      case "success":
        return "#ecfdf5" // green-50
      case "error":
        return "#fef2f2" // red-50 - light red background for errors
      case "info":
        return "#eff6ff" // blue-50
      case "warning":
        return "#fffbeb" // amber-50
      case "loading":
        return "#eff6ff" // blue-50
      default:
        return "#ffffff"
    }
  }

  // Determine if current message is a toast message based on title matching toast message types
  // This is a fallback in case latestMessage becomes null but currentMessage still has toast content
  const isCurrentMessageToast = currentMessage
    ? currentMessage.title === "Error" ||
      currentMessage.title === "Success" ||
      currentMessage.title === "Warning" ||
      currentMessage.title === "Info" ||
      currentMessage.title === "Loading"
    : false

  // Use latestMessage if available, otherwise check if currentMessage is a toast
  const effectiveToastMessage =
    latestMessage || (isCurrentMessageToast ? currentMessage : null)
  const effectiveMessageType = latestMessage
    ? latestMessage.type
    : isCurrentMessageToast && currentMessage?.title === "Error"
      ? "error"
      : isCurrentMessageToast && currentMessage?.title === "Success"
        ? "success"
        : isCurrentMessageToast && currentMessage?.title === "Warning"
          ? "warning"
          : isCurrentMessageToast && currentMessage?.title === "Info"
            ? "info"
            : isCurrentMessageToast && currentMessage?.title === "Loading"
              ? "loading"
              : null

  // Track previous message to detect actual changes
  const prevMessageRef = useRef<InstructionMessage | null>(null)

  // Update displayed lines when message actually changes
  useEffect(() => {
    if (!currentMessage) {
      setDisplayedMultiLine([])
      prevMessageRef.current = null
      return
    }

    // Check if message actually changed (not just a re-render)
    const messageChanged =
      !prevMessageRef.current ||
      prevMessageRef.current.title !== currentMessage.title ||
      prevMessageRef.current.shortDescription !==
        currentMessage.shortDescription ||
      JSON.stringify(prevMessageRef.current.multiLineDescription) !==
        JSON.stringify(currentMessage.multiLineDescription)

    if (messageChanged) {
      // Update displayed lines based on new message
      const newLines = currentMessage.multiLineDescription
        ? currentMessage.multiLineDescription
        : [currentMessage.shortDescription]

      setDisplayedMultiLine(newLines)
      prevMessageRef.current = currentMessage
    }
  }, [currentMessage])

  // Measure DynamicIsland height and update store
  useEffect(() => {
    if (!islandRef.current) return

    const updateHeight = () => {
      if (islandRef.current) {
        const height = islandRef.current.offsetHeight
        // Add bottom margin (32px) plus some padding (16px) for spacing
        setDynamicIslandHeight(height + 32 + 16)
      }
    }

    // Initial measurement
    updateHeight()

    // Use ResizeObserver to track size changes
    const resizeObserver = new ResizeObserver(() => {
      updateHeight()
    })

    resizeObserver.observe(islandRef.current)

    return () => {
      resizeObserver.disconnect()
    }
  }, [setDynamicIslandHeight, currentMessage, displayedMultiLine])

  // Don't render at all if no message
  if (!currentMessage) {
    return null
  }

  // Get message color if it's a toast message
  const messageColor = effectiveMessageType
    ? getMessageColor(effectiveMessageType)
    : PRIMARY_BLUE
  const messageBackgroundColor = effectiveMessageType
    ? getMessageBackgroundColor(effectiveMessageType)
    : "#ffffff"
  const isToastMessage = !!effectiveToastMessage

  // Helper to convert hex to rgba
  const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }

  // Helper to darken a hex color by a percentage
  const darkenColor = (hex: string, percent: number): string => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)

    const newR = Math.max(0, Math.min(255, Math.round(r * (1 - percent))))
    const newG = Math.max(0, Math.min(255, Math.round(g * (1 - percent))))
    const newB = Math.max(0, Math.min(255, Math.round(b * (1 - percent))))

    return `#${newR.toString(16).padStart(2, "0")}${newG.toString(16).padStart(2, "0")}${newB.toString(16).padStart(2, "0")}`
  }

  return (
    <Slide
      key={
        currentMessage
          ? `${currentMessage.title}-${currentMessage.shortDescription}`
          : "no-message"
      }
      direction="left"
      in={isVisible}
      timeout={300}
      mountOnEnter
      unmountOnExit
    >
      <Box
        ref={islandRef}
        sx={{
          position: "fixed",
          bottom: "22px",
          right: "10px",
          zIndex: 9998,
          maxWidth: `${typo.dynamicIslandWidth}px`,
          width: `${typo.dynamicIslandWidth}px`,
          pointerEvents: isVisible ? "auto" : "none",
        }}
      >
        <Box
          sx={{
            position: "relative",
            width: "100%",
            overflow: "hidden",
            borderRadius: "24px",
            zIndex: 0,
          }}
        >
          {/* Content area */}
          <Paper
            elevation={8}
            sx={{
              position: "relative",
              width: "100%",
              borderRadius: "24px",
              overflow: "hidden",
              backgroundColor: isToastMessage
                ? messageBackgroundColor
                : "#ffffff",
              color: "#202124",
              border: `2px solid ${messageColor}`,
              transition: "all 0.2s ease-in-out",
              boxShadow: isToastMessage
                ? `0px 4px 12px ${hexToRgba(messageColor, 0.3)}, 0px 8px 24px ${hexToRgba(messageColor, 0.2)}, 0px 16px 48px ${hexToRgba(messageColor, 0.15)}`
                : "0px 4px 12px rgba(66, 133, 244, 0.25), 0px 8px 24px rgba(66, 133, 244, 0.2), 0px 16px 48px rgba(66, 133, 244, 0.15)",
              zIndex: 1,
              "&:hover": {
                boxShadow: isToastMessage
                  ? `0px 6px 16px ${hexToRgba(messageColor, 0.4)}, 0px 12px 32px ${hexToRgba(messageColor, 0.3)}, 0px 24px 64px ${hexToRgba(messageColor, 0.2)}`
                  : "0px 6px 16px rgba(66, 133, 244, 0.3), 0px 12px 32px rgba(66, 133, 244, 0.25), 0px 24px 64px rgba(66, 133, 244, 0.2)",
              },
            }}
          >
            <Box
              sx={{
                position: "relative",
                overflow: "hidden",
                borderRadius: "12px",
                zIndex: 1,
                backgroundColor: "transparent",
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {/* Title */}
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    backgroundColor: isToastMessage
                      ? darkenColor(messageBackgroundColor, 0.05)
                      : "#FAFAFA",
                    px: 2.5,
                    py: 1.5,
                    borderBottom: "1px solid #e8eaed",
                  }}
                >
                  {/* Loading spinner for loading messages, importing roads, or processing files */}
                  {(latestMessage?.type === "loading" ||
                    (mapMode === "polygon_drawing" && isIngesting) ||
                    currentMessage.icon) && (
                    <CircularProgress
                      size={typo.iconButton.small - 2}
                      thickness={4}
                      sx={{
                        color: messageColor,
                        flexShrink: 0,
                        "& .MuiCircularProgress-circle": {
                          transition: "none",
                          animationDuration: "1.4s",
                        },
                        "& svg": {
                          willChange: "transform",
                          transform: "translateZ(0)",
                        },
                      }}
                    />
                  )}
                  <Typography
                    variant="body1"
                    sx={{
                      fontSize: typo.body.medium,
                      fontWeight: 600,
                      fontFamily: '"Google Sans", sans-serif',
                      color: isToastMessage ? messageColor : "#202124",
                      lineHeight: 1.4,
                      letterSpacing: "-0.01em",
                      position: "relative",
                    }}
                  >
                    {currentMessage.title}
                  </Typography>
                </Box>

                {/* Description lines */}
                {displayedMultiLine.length > 0 && (
                  <Box
                    sx={{
                      px: pxToMuiSpacing(typo.spacing.panel.px + 4),
                      py: pxToMuiSpacing(typo.spacing.panel.py),
                      display: "flex",
                      flexDirection: "column",
                      gap: 0.5,
                    }}
                  >
                    {displayedMultiLine.map((line, index) => {
                      // Special handling for icons - replace markers with actual icons inline
                      // Check if line contains any icon markers
                      const hasIcons =
                        line.includes("__EDIT_ICON__") ||
                        line.includes("__MODIFY_ICON__") ||
                        line.includes("__DELETE_ICON__")

                      if (hasIcons) {
                        // Split line by icon markers and render each part
                        const iconMarkers = [
                          "__EDIT_ICON__",
                          "__MODIFY_ICON__",
                          "__DELETE_ICON__",
                        ]
                        const parts: Array<{
                          text: string
                          icon?: React.ReactNode
                        }> = []
                        const lineText = line

                        // Find all icon markers and their positions
                        const markers: Array<{
                          marker: string
                          position: number
                          icon: React.ReactNode
                        }> = []
                        iconMarkers.forEach((marker) => {
                          const position = lineText.indexOf(marker)
                          if (position !== -1) {
                            let icon: React.ReactNode = null
                            if (marker === "__EDIT_ICON__") {
                              icon = (
                                <Edit
                                  sx={{
                                    fontSize: typo.body.small,
                                    color: "#5f6368",
                                    flexShrink: 0,
                                    verticalAlign: "middle",
                                  }}
                                />
                              )
                            } else if (marker === "__MODIFY_ICON__") {
                              icon = (
                                <EditLocationAlt
                                  sx={{
                                    fontSize: typo.body.small,
                                    color: "#5f6368",
                                    flexShrink: 0,
                                    verticalAlign: "middle",
                                  }}
                                />
                              )
                            } else if (marker === "__DELETE_ICON__") {
                              icon = (
                                <Delete
                                  sx={{
                                    fontSize: typo.body.small,
                                    color: "#5f6368",
                                    flexShrink: 0,
                                    verticalAlign: "middle",
                                  }}
                                />
                              )
                            }
                            markers.push({ marker, position, icon })
                          }
                        })

                        // Sort markers by position
                        markers.sort((a, b) => a.position - b.position)

                        // Build parts array
                        let currentPos = 0
                        markers.forEach(({ marker, position, icon }) => {
                          // Add text before icon
                          if (position > currentPos) {
                            parts.push({
                              text: lineText.slice(currentPos, position),
                            })
                          }
                          // Add icon
                          parts.push({ text: "", icon })
                          currentPos = position + marker.length
                        })
                        // Add remaining text
                        if (currentPos < lineText.length) {
                          parts.push({ text: lineText.slice(currentPos) })
                        }

                        return (
                          <Fade
                            key={`${currentMessage.title}-${index}-${line}`}
                            in={true}
                            timeout={400}
                            style={{
                              transitionDelay: `${index * 50}ms`,
                            }}
                          >
                            <Typography
                              component="div"
                              sx={{
                                fontSize: typo.body.xsmall,
                                fontWeight: 400,
                                fontFamily: '"Google Sans", sans-serif',
                                color: "#5f6368",
                                lineHeight: 1.6,
                                display: "flex",
                                alignItems: "center",
                                flexWrap: "wrap",
                                letterSpacing: "-0.01em",
                              }}
                            >
                              {parts.map((part, partIndex) => {
                                if (part.icon) {
                                  return (
                                    <Box key={partIndex} component="span">
                                      {part.icon}
                                    </Box>
                                  )
                                }
                                if (part.text) {
                                  return (
                                    <Box
                                      key={partIndex}
                                      component="span"
                                      sx={{ fontSize: typo.body.xsmall }}
                                    >
                                      {parseFormattedText(part.text).map(
                                        (textPart, textPartIndex) => (
                                          <Box
                                            key={textPartIndex}
                                            component="span"
                                            sx={{
                                              fontSize: typo.body.xsmall,
                                              fontWeight: textPart.bold
                                                ? 600
                                                : 400,
                                              color: textPart.bold
                                                ? "#202124"
                                                : "#5f6368",
                                            }}
                                          >
                                            {textPart.text}
                                          </Box>
                                        ),
                                      )}
                                    </Box>
                                  )
                                }
                                return null
                              })}
                            </Typography>
                          </Fade>
                        )
                      }

                      // Special handling for color legend in editing_uploaded_route mode
                      if (
                        line === "__COLOR_LEGEND__" &&
                        currentMessage.title === "Reviewing Uploaded Route"
                      ) {
                        return (
                          <Fade
                            key={`${currentMessage.title}-color-legend-${index}`}
                            in={true}
                            timeout={400}
                            style={{
                              transitionDelay: `${index * 50}ms`,
                            }}
                          >
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1.5,
                                flexWrap: "nowrap",
                              }}
                            >
                              <Box
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 0.5,
                                  flexShrink: 0,
                                }}
                              >
                                <Box
                                  sx={{
                                    width: 10,
                                    height: 10,
                                    borderRadius: "50%",
                                    backgroundColor: "#FFEB3B",
                                    border: "1px solid rgba(0, 0, 0, 0.1)",
                                    flexShrink: 0,
                                  }}
                                />
                                <Typography
                                  component="span"
                                  sx={{
                                    fontSize: typo.body.xsmall,
                                    fontWeight: 400,
                                    fontFamily: '"Google Sans", sans-serif',
                                    color: "#5f6368",
                                    lineHeight: 1.5,
                                    letterSpacing: "-0.01em",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  Uploaded
                                </Typography>
                              </Box>
                              <Box
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 0.5,
                                  flexShrink: 0,
                                }}
                              >
                                <Box
                                  sx={{
                                    width: 10,
                                    height: 10,
                                    borderRadius: "50%",
                                    backgroundColor: "#9C27B0",
                                    border: "1px solid rgba(0, 0, 0, 0.1)",
                                    flexShrink: 0,
                                  }}
                                />
                                <Typography
                                  component="span"
                                  sx={{
                                    fontSize: typo.body.xsmall,
                                    fontWeight: 400,
                                    fontFamily: '"Google Sans", sans-serif',
                                    color: "#5f6368",
                                    lineHeight: 1.5,
                                    letterSpacing: "-0.01em",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  Google's
                                </Typography>
                              </Box>
                            </Box>
                          </Fade>
                        )
                      }

                      const formattedParts = parseFormattedText(line)

                      return (
                        <Fade
                          key={`${currentMessage.title}-${index}-${line}`}
                          in={true}
                          timeout={400}
                          style={{
                            transitionDelay: `${index * 50}ms`,
                          }}
                        >
                          <Typography
                            component="div"
                            sx={{
                              fontSize: typo.body.xsmall,
                              fontWeight: 400,
                              fontFamily: '"Google Sans", sans-serif',
                              color: "#5f6368",
                              lineHeight: 1.6,
                              display: "block",
                              letterSpacing: "-0.01em",
                            }}
                          >
                            {formattedParts.map((part, partIndex) => (
                              <Box
                                key={partIndex}
                                component="span"
                                sx={{
                                  fontSize: typo.body.xsmall,
                                  fontWeight: part.bold ? 600 : 400,
                                  color: part.bold ? "#202124" : "#5f6368",
                                }}
                              >
                                {part.text}
                              </Box>
                            ))}
                          </Typography>
                        </Fade>
                      )
                    })}
                  </Box>
                )}
              </Box>
            </Box>
          </Paper>
        </Box>
      </Box>
    </Slide>
  )
}

export default DynamicIsland
