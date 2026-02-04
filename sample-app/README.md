# Google Maps Platform Roads Management Insights Demo

[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Overview

Google Maps Platform Roads Management Insights provides access to real-time and historical traffic data. This project demonstrates how to turn complex data into actionable insights for city planners, engineers, and officials. The demo is designed to be intuitive and easy to set up.

---

## 📖 Setup Guide

### Prerequisites

- **Python** (3.12)
- **Poetry** (dependency management)
    ```bash
    pip install poetry
    ```
- **Google Cloud CLI** ([Install Guide](https://cloud.google.com/sdk/docs/install))

### Running the app with demo data

#### 1. Clone and Install Dependencies

```bash
git clone https://github.com/LeptonSoftware/google-rmi.git
cd google-rmi
poetry install
```

#### 2. Start the Application Server

```bash
poetry run uvicorn server:app --reload
```

#### 3. Open Your Browser

Go to [http://localhost:8000/](http://localhost:8000/)

---

### Running the app with your RMI data

#### Clone and install dependencies

```bash
git clone https://github.com/LeptonSoftware/google-rmi.git
cd google-rmi
poetry install
```

#### Authenticate with Google Cloud

```bash
gcloud auth application-default login
```

Enable these APIs in your Google Cloud Project:
- BigQuery API
- Cloud Run API
- Google API
- Road Selection API

---

#### Configuration

This app uses a `.env` file for settings.

#### Automated Setup (Recommended)

Run the interactive setup script:

```bash
poetry run python rmi_setup.py
```

**Default values:**  
If you want to use the default for Dataset (`historical_roads_data`), Historical Table (`historical_travel_time`), Routes Table (`routes_status`), or Usecases (`realtime-monitoring,data-analytics`) just press Enter when prompted.

Note: For finding the correct timezone for your city, refer to this [link](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)

**Example:**

```bash
Enter the name of the city: chennai
Enter the BigQuery Project for chennai: rmi-sandbox
Enter the BigQuery Dataset for chennai [historical_roads_data]: demo_chennai
Enter the BigQuery Historical Table for chennai [historical_travel_time]: 
Enter the BigQuery Routes Table for chennai [routes_status]: 
Enter the Google API Key: AIzaSyBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Please select usecases for this city (press enter for each usecase, separate multiple choices by commas):
1) realtime-monitoring
2) data-analytics
3) route-reliability
Enter the numbers of the selected usecases [1,2]: 1,2,3

🔍 Validating BigQuery connection for rmi-sandbox...
✅ BigQuery connection validated successfully.

✅ City chennai setup complete!
```

**What the script creates:**

Your `.env` file will look like:

```env
CHENNAI_BIGQUERY_PROJECT=rmi-sandbox
CHENNAI_BIGQUERY_HISTORICAL_DATASET=demo_chennai
CHENNAI_BIGQUERY_HISTORICAL_TABLE=historical_travel_time
CHENNAI_BIGQUERY_ROUTES_TABLE=routes_status
CHENNAI_TIMEZONE=Asia/Kolkata
CHENNAI_USECASES=realtime-monitoring,data-analytics,route-reliability
GOOGLE_API_KEY=AIzaSyBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
APPLICATION_MODE=live
```

**Multiple Cities:**  
Run the setup script again for each city you want to add.

#### Manual Setup

Create a `.env` file in the root directory:

```env
CITYNAME_BIGQUERY_PROJECT=your-bigquery-project-id
CITYNAME_BIGQUERY_HISTORICAL_DATASET=historical_roads_data
CITYNAME_BIGQUERY_HISTORICAL_TABLE=historical_travel_time
CITYNAME_BIGQUERY_ROUTES_TABLE=routes_status
CITYNAME_TIMEZONE=your-city-timezone
CITYNAME_USECASES=realtime-monitoring,data-analytics,route-reliability
GOOGLE_API_KEY=your-google-api-key
APPLICATION_MODE=live
```

Replace `CITYNAME` with your city name in uppercase (e.g., CHENNAI, PARIS).

#### APPLICATION_MODE:  
- Set to `live` to use your configured cities and real data.
- Set to `demo` to use demo data.

The script will:
- Validate your BigQuery connection
- Set the Timezone using Timezone API
- Create/update the `.env` file

#### Start the Application Server

```bash
poetry run uvicorn server:app --reload
```

#### Open Your Browser

Go to [http://localhost:8000/](http://localhost:8000/)

---

## Deployment

### Deploy to Google Cloud Run

```bash
gcloud run deploy google-rmi-demo --project=your-google-cloud-project-id --region=us-central1 --source . --allow-unauthenticated --platform managed --service-account=your-service-account-gmail --max-instances=10
```

- Replace `your-google-cloud-project-id` and `your-service-account-gmail` as needed.
- Service account needs following permissions:
  - roles/bigquery.dataViewer
  - roles/bigquery.jobUser

---

## Environment Variables Reference

| Variable Name                    | Description                                                      | Example Value                  |
|----------------------------------|------------------------------------------------------------------|-------------------------------|
| CITYNAME_BIGQUERY_PROJECT        | Google project ID for the city                                   | rmi-sandbox                   |
| CITYNAME_BIGQUERY_HISTORICAL_DATASET | Dataset name for data                                        | demo_chennai          |
| CITYNAME_BIGQUERY_HISTORICAL_TABLE  | Table name for historical travel times                        | historical_travel_time         |
| CITYNAME_BIGQUERY_ROUTES_TABLE   | Table name for route status                                      | routes_status                  |
| CITYNAME_TIMEZONE                | Timezone for the city                                            | Asia/Kolkata                   |
| CITYNAME_USECASES                | Comma-separated use cases enabled for the city                   | realtime-monitoring,data-analytics,route-reliability |
| GOOGLE_API_KEY                   | Google API key                                                   | AIzaSyBxxxxxxxxxxxxxxxxxxxxxxx |
| APPLICATION_MODE                 | Set to `live` for real data, `demo` for demo data                | live                           |

---


If you want to use demo data, set `APPLICATION_MODE=demo` in your `.env` file.

### Map Style

The [exported_style.json](data/map-style/exported_style.json) file provides the Google Maps styling configuration applied in this application. It can serve as a reference or starting point for creating customized map styles.

---

**Need help?**  
Open an issue on GitHub or contact the maintainers.
