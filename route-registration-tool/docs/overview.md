# Product Overview: Road Selection Tool

The **Road Selection Tool** is a specialized geospatial application designed to bridge the gap between map-based selection and high-fidelity road data for the **Road Management Insights (RMI)** ecosystem. It allows users to curate, refine, and synchronize road networks with precision.

For more information on the underlying product, visit the official [Roads Management Insights Documentation](https://developers.google.com/maps/documentation/roads-management-insights).

---

## Core Concepts

### Projects & Unique Identity (UUID)
In the Road Selection Tool, every project is a distinct entity defined by a **Global Unique Identifier (UUID)**.
*   **Persistent Identity**: Unlike simple project names, a UUID provides a permanent, immutable reference for your project. This is critical for data integrity when exporting and importing project data across different environments.
*   **Workspace Integrity**: The UUID ensures that your project's road data remains uniquely yours, preventing collisions or data mixing even in multi-user environments.

### Workspaces & Session-Based Sharing
The tool operates on a **Workspace** model tied to a unique `session_id`.
*   **Personal Workspace**: By default, each user starts in their own workspace (scoped to a unique session ID).
*   **Collaborative Linking**: Workspaces can be shared by linking two or more session IDs. Once linked, users share visibility and control over all projects within that combined workspace. This peer-to-peer sharing model simplifies collaboration without the overhead of traditional user management.

### Intelligent Snapping (Google Roads API)
A core value of the tool is its ability to turn manual map clicks into precise road geometries.
*   **Snapping Mechanism**: The tool integrates directly with the [Google Roads API](https://developers.google.com/maps/documentation/roads-api). As you select points on the map, the tool "snaps" them to the actual road network, correcting for GPS noise and providing the clean polylines required for [RMI analysis](https://developers.google.com/maps/documentation/roads-management-insights/overview).

---

[Explore the Usage Guide](./usage-guide.md)
