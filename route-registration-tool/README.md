# Road Selection Tool

## Overview

Road Selection Tool is a tool that allows you to select roads from a map and save them to a database and sync them to your bigquery project. It works as a selection tool for the Road Management Insights project.

## Setup and Installation

1.  **Prerequisites**
    - Python 3.12+
    - Poetry

      - For dependency management and packaging. Please follow the
        instructions on the official
        [Poetry website](https://python-poetry.org/docs/) for installation.

      ```bash
      pip install poetry
      ```

    - Docker & Docker Compose

      - Required for containerization. Please follow the official [Docker installation guide](https://docs.docker.com/get-docker/) for your specific operating system.

    - A project on Google Cloud Platform

    - Google Cloud CLI
      - For installation, please follow the instruction on the official
        [Google Cloud website](https://cloud.google.com/sdk/docs/install).

    - Google Big Query dataset which will get routes updated data.

    - Google API Key with following APIs enabled:
      - Roads API
      - Maps JavaScript API

2.  **Installation**

    ```bash
    # Clone this repository.
    git clone https://github.com/googlemaps-samples/roads-management-insights-samples.git
    # Get inside directory.
    cd route-registration-tool
    ```

3.  **Authenticate with Google Cloud**

    - Set up Google Cloud credentials:

      ```bash
      gcloud auth application-default login
      ```
      This will lead you to google login page, where you can login in using the account whose projects you want to use.

4.  **Configuration**
    
    - Configure your environment variables.
    - Copy `.env.example` into a file called `.env`.
    - Open the `.env` file and set Google API key there.
    - **Database (supported)**:
      - **SQLite (default)**: uses an on-disk SQLite DB file (defaults to `my_database.db` in the `route-registration-tool` folder).
        - Configure with `DATABASE_URL=sqlite+aiosqlite:///./my_database.db` (or omit `DATABASE_URL` to use the default).
      - **PostgreSQL**: set `DATABASE_URL` to a `postgresql+asyncpg://...` URL.


5.  **Run the application locally**

    From the `route-registration-tool` directory:

    1. Install UI dependencies and build the frontend:

       ```bash
       cd ui
       npm i
       npm run build
       cd ..
       ```

    2. Set environment variables (if not done already):
       - Copy `.env.example` to `.env` in the `route-registration-tool` folder.
       - Edit `.env` and set your Google API key and any other required variables.

    3. Start the server from the `route-registration-tool` folder:

       ```bash
       poetry run uvicorn server.main:app --reload --host 0.0.0.0 --port 8000
       ```

    The application will be available at `http://localhost:8000`.

6. **Build and Deploy Docker Container (Local Deployment Only)**

  *Note: This step is only necessary if you want to deploy the container locally.*

  - Build the Docker image:
    ```bash
    docker compose build -t <image_name> .
    ```
    - Open `docker-compose.yml` file and ensure the image name is correct.
  - Deploy the container:
    ```bash
    docker compose up -d
    ```

## Deployment

### BigQuery Setup

The route synchronization background process expects a BigQuery dataset to exist in the `US` location named `historical_roads_data` with specific tables and schema (including `GEOGRAPHY` types for spatial functions).

We have provided a setup script to automate this.

```bash
# 1. Make the script executable
chmod +x bq_setup.sh

# 2. Run the script (it will prompt you for your configuration)
./bq_setup.sh
```

### Deploy to Google Cloud Run

```bash
gcloud run deploy route-registration-tool \
  --project=your-google-cloud-project-id \
  --region=us-central1 \
  --source . \
  --allow-unauthenticated \
  --platform managed \
  --service-account=your-service-account-email \
  --add-cloudsql-instances=PROJECT_NAME:REGION:INSTANCE (if using cloud SQL)
```

### Required Permissions

Replace `your-google-cloud-project-id` and `your-service-account-gmail` as needed. The Service Account used for deployment needs the following roles:
- `roles/bigquery.jobUser` (Project level)
- `roles/bigquery.dataViewer` (Restricted to the RMI BigQuery dataset resource only)
- `roles/datastore.user` (if Firestore logging is enabled)
- `roles/logging.logWriter`
- `roles/roads.roadsSelectionAdmin` (Project level)
- `roles/serviceusage.serviceUsageConsumer` (Project level)
- `roles/secretmanager.secretAccessor` (Restricted to the `ROUTE_REGISTRATION_MAPS_API_KEY` secret resource only)
  - A Custom IAM Role containing the following permissions:
    - `roads.selectedRoutes.batchCreate`
    - `roads.selectedRoutes.create`
    - `roads.selectedRoutes.delete`
    - `roads.selectedRoutes.get`
    - `roads.selectedRoutes.list`



