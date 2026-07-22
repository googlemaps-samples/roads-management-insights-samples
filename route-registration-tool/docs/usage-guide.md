# Usage Guide: Road Selection Tool

This guide walks you through the core product workflows, from project creation to data synchronization.

---

## 1. Initializing Your Workspace (Creating a Project)
Projects are created within your existing session-scoped workspace.
1.  From the **Dashboard**, click **"Add Project"**.
2.  Specify your **Google Cloud Project ID** and target **BigQuery Dataset**.
3.  Provide a **Project Name**.
4.  Once created, your project is assigned a permanent **Project UUID**, and your interactive map workspace is ready.

---

## 2. Interactive Road Selection & Snapping
Once in your workspace, the goal is to curate precise road routes.
1.  **Navigate**: Locate your focus area on the map.
2.  **Select**: Click on the road segments you wish to include. The tool will automatically begin building a route based on your clicks.
3.  **Refine**: Use the **Snapping** tool to align your manually selected points with the actual road network, powered by the [Google Roads API](https://developers.google.com/maps/documentation/roads-api).
4.  **Save Route**: When satisfied, click **"Save Route"**. You can now assign metadata, priorities, or names to this specific segment.

---

## 3. Collaborative Project Sharing
Sharing your entire workspace with colleagues is done through **Session Linking**.
1.  Locate your unique **Session ID** (this is a UUID representing your current workspace session).
2.  Obtain the Session ID of the teammate you wish to collaborate with.
3.  Use **Share projects** → **Link user** to bind these IDs.
4.  **Shared Visibility**: Both users can now view, edit, and contribute to all projects within the linked workspace.

---

## 4. Synchronizing to BigQuery
The final stage of the workflow is pushing your curated data into the [RMI Analytics pipeline](https://developers.google.com/maps/documentation/roads-management-insights/bigquery-schema).
1.  Click the **"Sync"** button in the top menu.
2.  The tool prepares your project and route data according to the RMI BigQuery Schema.
3.  **Track Progress**: Monitor the **Sync Status** column to verify when each route has been successfully uploaded to your BigQuery dataset.

---

## Advanced Workflows
*   **Bulk Import**: Upload your existing road data in GeoJSON format to pre-populate your workspace.
*   **Project Migration**: Use the **Export/Import** feature to move entire projects (preserving their UUID identity) between different tool instances.

---

[Back to Product Overview](./overview.md)
