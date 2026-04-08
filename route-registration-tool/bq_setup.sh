#!/bin/bash
# bq_setup.sh
# Script to create the required BigQuery dataset and tables for the Roads API sync.

set -e

# --- Configuration Variables ---
echo "========================================="
echo "BigQuery Setup for Roads Sync Tool"
echo "========================================="
echo ""

read -p "Enter your Google Cloud Project ID: " PROJECT_ID
if [ -z "$PROJECT_ID" ]; then
    echo "ERROR: Project ID cannot be empty."
    exit 1
fi

read -p "Enter the Dataset Name [default: historical_roads_data]: " DATASET_NAME
DATASET_NAME=${DATASET_NAME:-historical_roads_data}

read -p "Enter the BigQuery Location (e.g., US, EU) [default: US]: " LOCATION
LOCATION=${LOCATION:-US}

echo ""
echo "Creating dataset $DATASET_NAME in project $PROJECT_ID at location $LOCATION..."
echo ""

echo "[1/4] Checking authentication..."
# Ensure the user is authenticated with gcloud
if ! gcloud auth print-access-token &> /dev/null; then
    echo "ERROR: Not authenticated with gcloud. Please run 'gcloud auth login' first."
    exit 1
fi

echo "[2/4] Creating dataset: $DATASET_NAME (Location: $LOCATION)..."
if bq ls --project_id="$PROJECT_ID" | grep -q "$DATASET_NAME"; then
    echo "Dataset $DATASET_NAME already exists, skipping creation."
else
    bq mk --location="$LOCATION" -d "$PROJECT_ID:$DATASET_NAME"
    echo "Dataset created successfully."
fi

echo "[3/4] Creating table: routes_status..."
if bq ls --project_id="$PROJECT_ID" "$DATASET_NAME" | grep -q "routes_status"; then
    echo "Table routes_status already exists, skipping."
else
    bq mk -t "$PROJECT_ID:$DATASET_NAME.routes_status" selected_route_id:STRING,status:STRING
    echo "Table routes_status created successfully."
fi

echo "[4/4] Creating table: recent_roads_data..."
if bq ls --project_id="$PROJECT_ID" "$DATASET_NAME" | grep -q "recent_roads_data"; then
    echo "Table recent_roads_data already exists, skipping."
else
    SCHEMA_JSON='[
      {"name": "selected_route_id", "type": "STRING", "mode": "NULLABLE"},
      {"name": "display_name", "type": "STRING", "mode": "NULLABLE"},
      {"name": "route_geometry", "type": "GEOGRAPHY", "mode": "NULLABLE"},
      {"name": "record_time", "type": "TIMESTAMP", "mode": "NULLABLE"},
      {"name": "duration_in_seconds", "type": "INT64", "mode": "NULLABLE"},
      {"name": "static_duration_in_seconds", "type": "INT64", "mode": "NULLABLE"},
      {
        "name": "speed_reading_intervals",
        "type": "RECORD",
        "mode": "REPEATED",
        "fields": [
          {"name": "speed", "type": "STRING", "mode": "NULLABLE"}
        ]
      }
    ]'

    # Write schema to temporary file
    TEMP_SCHEMA_FILE=$(mktemp)
    echo "$SCHEMA_JSON" > "$TEMP_SCHEMA_FILE"

    bq mk -t "$PROJECT_ID:$DATASET_NAME.recent_roads_data" "$TEMP_SCHEMA_FILE"
    
    # Clean up temp file
    rm "$TEMP_SCHEMA_FILE"
    echo "Table recent_roads_data created successfully."
fi

echo ""
echo "========================================="
echo "Setup Complete!"
echo "The dataset $DATASET_NAME and its tables are ready."
echo "========================================="
