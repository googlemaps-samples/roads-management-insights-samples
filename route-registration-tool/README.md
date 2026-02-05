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

5. **Build and Deploy Docker Container**

  - Build the Docker image:
    ```bash
    docker compose build -t <image_name> .
    ```
    - Open docker-compose.yml file and ensure the image name in correct
  - Deploy the container:
    ```bash
    docker compose up -d
    ```

## Deployment

### Deploy to Google Cloud Run

```bash
gcloud run deploy route-registration-tool --project=your-google-cloud-project-id --region=us-central1 --source . --allow-unauthenticated --platform managed --service-account=your-service-account-gmail --max-instances=1 --min-instances=1
```

- Replace `your-google-cloud-project-id` and `your-service-account-gmail` as needed.
- Service account needs following permissions:
  - roles/bigquery.dataViewer
  - roles/bigquery.jobUser
