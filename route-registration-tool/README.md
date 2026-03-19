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

### Option 1: Secured Deployment (Recommended)

#### Automated via Cloud Build
This project includes a `cloudbuild.yaml` file to automate deployment with security best practices. It uses **Google Cloud Secret Manager** to securely manage the Maps API Key.

1.  **Store your API Key in Secret Manager:**
    ```bash
    echo -n "YOUR_API_KEY" | gcloud secrets create ROUTE_REGISTRATION_MAPS_API_KEY --data-file=-
    ```

2.  **Grant access to the Service Account:**
    The service account used by Cloud Run (`route-registration-sa@$PROJECT_ID.iam.gserviceaccount.com`) needs the `Secret Manager Secret Accessor` role for this secret.

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
  --max-instances=1 \
  --min-instances=0
```

### Required Permissions
The Service Account used for deployment needs the following roles:
- `roles/bigquery.jobUser` (Project level)
- `roles/bigquery.dataViewer` (Restricted to the RMI BigQuery dataset resource only)
- `roles/datastore.user` (if Firestore logging is enabled)
- `roles/logging.logWriter`
- `roles/roads.roadsSelectionAdmin` (Project level)
- `roles/serviceusage.serviceUsageConsumer` (Project level)
- `roles/secretmanager.secretAccessor` (Restricted to the `ROUTE_REGISTRATION_MAPS_API_KEY` secret resource only)
