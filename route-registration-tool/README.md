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

    - A **service account** (or local Application Default Credentials) used
      for all backend Google Maps Platform API calls. Backend calls do **not**
      use an API key — auth is via OAuth bearer tokens minted from ADC. The
      service account / user must have the `roads.googleapis.com` APIs
      enabled and the IAM roles listed under **Required Permissions**.

    - Google API Key (browser-side only, for the Maps JavaScript loader):
      - Maps JavaScript API
      - Restrict the key to your deployed origin(s).

2.  **Installation**

    ```bash
    # Clone this repository.
    git clone https://github.com/googlemaps-samples/roads-management-insights-samples.git
    # Get inside directory.
    cd route-registration-tool
    ```

3.  **Authenticate with Google Cloud**

    - Set up Google Cloud credentials. The backend uses Application Default
      Credentials (ADC) for **all** Google Maps Platform API calls (Roads
      API, route selection API, etc.). On Cloud Run this is the attached
      service account; locally it is your `gcloud` ADC login:

      ```bash
      gcloud auth application-default login
      ```
      This will lead you to a Google login page; sign in with the account
      whose projects you want to use. The signed-in principal must have the
      IAM roles listed under **Required Permissions** below.

4.  **Configuration**

    - Configure your environment variables.
    - Copy `.env.example` into a file called `.env`.
    - Set `GOOGLE_API_KEY` — this is used **only** for the browser-side Maps
      JavaScript loader (not for any backend API call). Backend Google Maps
      Platform calls bill quota to the ADC principal's home project (locally
      this is whatever `gcloud config get-value project` returns; on Cloud
      Run it is the service account's home project).
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
       - Edit `.env` and set `GOOGLE_API_KEY` (browser-side Maps JS only) and
         any other required variables. Backend Google Maps Platform calls use
         ADC (not the API key) and bill quota to the ADC principal's home
         project.

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

### Option 1: Secured Deployment (Recommended)

#### Automated via Cloud Build
This project includes a `cloudbuild.yaml` file to automate deployment with security best practices. It uses **Google Cloud Secret Manager** to securely manage the **browser-side** Maps JavaScript API key. Backend Google Maps Platform calls (Roads API, route selection, etc.) authenticate via the Cloud Run service account — no API key is involved server-side.

1.  **Store your Maps JS API Key in Secret Manager** (used only for the
    frontend Maps JS loader):
    ```bash
    echo -n "YOUR_API_KEY" | gcloud secrets create ROUTE_REGISTRATION_MAPS_API_KEY --data-file=-
    ```

2.  **Grant access to the Service Account:**
    The service account used by Cloud Run (`route-registration-sa@$PROJECT_ID.iam.gserviceaccount.com`) needs the `Secret Manager Secret Accessor` role for this secret. The same service account is what backend Google Maps Platform calls authenticate as, so it must hold the IAM roles listed below.

3.  **Submit the Build:**
    ```bash
    gcloud builds submit --config cloudbuild.yaml .
    ```

#### Manual via CLI
To manually deploy using secrets:
```bash
gcloud run deploy route-registration-tool \
  --project=your-google-cloud-project-id \
  --region=us-central1 \
  --source . \
  --no-allow-unauthenticated \
  --platform managed \
  --service-account=your-service-account-email \
  --max-instances=1 \
  --min-instances=0 \
  --set-secrets=GOOGLE_API_KEY=ROUTE_REGISTRATION_MAPS_API_KEY:latest
```

#### Accessing the Secured Service
Since the service is deployed with `--no-allow-unauthenticated`, you must use a proxy to access it from your local machine:
```bash
gcloud run services proxy route-registration-tool --region us-central1 --port 8081
```
Then, open your browser and navigate to: **http://localhost:8081**

### Option 2: Public Access Deployment (For Demos Only)

If you need the service to be publicly accessible without authentication (accessible directly via the Cloud Run URL):

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
The Service Account used for deployment authenticates **all** backend Google Maps Platform API calls (Roads API, route selection, etc.) via Application Default Credentials. It needs the following roles:
- `roles/bigquery.jobUser` (Project level)
- `roles/bigquery.dataViewer` (Restricted to the RMI BigQuery dataset resource only)
- `roles/datastore.user` (if Firestore logging is enabled)
- `roles/logging.logWriter`
- `roles/roads.roadsSelectionAdmin` (Project level)
- `roles/serviceusage.serviceUsageConsumer` (Project level — required because backend calls set `X-Goog-User-Project` for quota attribution)
- `roles/secretmanager.secretAccessor` (Restricted to the `ROUTE_REGISTRATION_MAPS_API_KEY` secret resource only — for the browser-side Maps JS key)

The Roads API must be enabled on the **ADC principal's home project** — that is the project all backend Google Maps Platform calls bill quota to (via the `X-Goog-User-Project` header), regardless of which app project is selected in the UI.
