# Copyright 2025 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.


from google.cloud import bigquery
from datetime import datetime
import requests

def get_timezone_from_coordinates(lat, lon, api_key):
    """Get timezone using coordinates and timestamp."""
    timestamp = int(datetime.now().timestamp())  # current timestamp
    url = f"https://maps.googleapis.com/maps/api/timezone/json?location={lat},{lon}&timestamp={timestamp}&key={api_key}"
    
    response = requests.get(url)
    data = response.json()

    if data['status'] == 'OK':
        timezone_id = data['timeZoneId']
        return timezone_id
    else:
        print(f"❌ Error: Unable to fetch timezone. Response: {data}")
        return None
    
# Update the BigQuery validation function to fetch coordinates
def validate_bigquery_connection_and_get_coordinates(bigquery_project, historical_dataset, historical_table):
    """Validate BigQuery connection and fetch coordinates."""
    print(f"\n🔍 Validating BigQuery connection for {bigquery_project}...")
    
    try:
        client = bigquery.Client(project=bigquery_project)
        
        # Query to get the min(record_time)
        test_query = f"""
            SELECT min(record_time) as record_time
            FROM `{bigquery_project}.{historical_dataset}.{historical_table}` 
            WHERE record_time IS NOT NULL
            LIMIT 1
        """
        result = client.query(test_query).result()
        row = next(iter(result))
        
        if row.record_time is not None:
            min_record_time = row.record_time
            
            # Query to get data for this min(record_time)
            time_query = f"""
                SELECT * 
                FROM `{bigquery_project}.{historical_dataset}.{historical_table}` 
                WHERE record_time = '{min_record_time}' 
                LIMIT 1
            """
            result = client.query(time_query).result()
            row = next(iter(result))
            
            # Remove 'LINESTRING(' prefix and ')' suffix
            geometry = row.route_geometry.replace("LINESTRING(", "").replace(")", "")
            first_point = geometry.split(",")[0].strip()  # Get first point
            lon_str, lat_str = first_point.split()  # split on space
            lat = float(lat_str)
            lon = float(lon_str)

            print(f"✅ BigQuery connection validated successfully.")
            
            return lat, lon
        else:
            print(f"❌ BigQuery table exists but contains no data.")
            return None, None, None
            
    except Exception as e:
        print(f"❌ BigQuery connection failed: {e}")
        return None, None, None


def get_usecases():
    """Ask user to select use cases for the city."""
    usecases = ["realtime-monitoring", "data-analytics", "route-reliability"]
    print("Please select usecases for this city (press enter for each usecase, separate multiple choices by commas):")
    
    # Display usecases for selection
    for i, usecase in enumerate(usecases, 1):
        print(f"{i}) {usecase}")
    
    selection = input(f"Enter the numbers of the selected usecases [1,2]: ").strip()
    
    # If no input is provided, set default value as [1,2]
    if not selection:
        selected_usecases = [usecases[i-1] for i in [1, 2]]
    else:
        # Parse and return the selected usecases
        selected_usecases = [
            usecases[int(index.strip()) - 1] for index in selection.split(',') if index.strip().isdigit()
        ]
    
    return ','.join(selected_usecases)

def city_exists_in_env(city_name, env_lines):
    """Check if city exists in the .env lines."""
    city_prefix = city_name.upper()
    return any(line.startswith(city_prefix) for line in env_lines)

def check_google_api_key(env_lines):
    """Check if the GOOGLE_API_KEY exists in the environment variables."""
    return any("GOOGLE_API_KEY" in line for line in env_lines)

def update_env_file(env_lines, city_name, new_data):
    """Update the .env file content."""
    updated_env_file = [line for line in env_lines if not line.startswith(city_name.upper())]
    updated_env_file.extend(new_data)
    updated_env_file = [line for line in updated_env_file if not line.startswith("APPLICATION_MODE")]
    updated_env_file.append("APPLICATION_MODE=live\n")
    return updated_env_file

def read_env_file(file_path):
    """Read the .env file and return lines."""
    try:
        with open(file_path, "r") as file:
            return file.readlines()
    except FileNotFoundError:
        print(f"Note: {file_path} not found, will create a new one.")
        return []

def write_env_file(file_path, env_lines):
    """Write updated .env content back to the file."""
    with open(file_path, "w") as file:
        file.writelines(env_lines)


def gather_city_data(city_name, env_lines):
    """Collect data for a city, including timezone using coordinates."""
    # Default values
    default_dataset = "historical_roads_data"
    default_historical_table = "historical_travel_time"
    default_routes_table = "routes_status"

    timezone = None  # Initialize timezone variable to avoid UnboundLocalError
    while True:
        bigquery_project = input(f"Enter the BigQuery Project for {city_name}: ")
        historical_dataset = input(f"Enter the BigQuery Dataset for {city_name} [{default_dataset}]: ") or default_dataset
        historical_table = input(f"Enter the BigQuery Historical Table for {city_name} [{default_historical_table}]: ") or default_historical_table
        routes_table = input(f"Enter the BigQuery Routes Table for {city_name} [{default_routes_table}]: ") or default_routes_table
        
        # Timezone API Key input
        api_key = input("Enter the Google API Key: ") if not check_google_api_key(env_lines) else next(line.split("=")[1].strip() for line in env_lines if "GOOGLE_API_KEY" in line)
        
        # Get usecases for the city
        usecases = get_usecases()
        
        # Validate BigQuery connection and get coordinates
        lat, lon = validate_bigquery_connection_and_get_coordinates(bigquery_project, historical_dataset, historical_table)
        
        if lat is not None and lon is not None:
            # Call the Timezone API
            timezone = get_timezone_from_coordinates(lat, lon, api_key)
            if timezone:
                break
            else:
                print(f"❌ Failed to get timezone, please check API or coordinates.")
        else:
            retry = input("BigQuery validation failed. Retry with different credentials? (Y/N): ").lower()
            if retry not in ['y', 'yes']:
                print(f"No changes made. Exiting without creating .env file.")
                return None  # Return None to indicate no data was collected

    # Ensure timezone is set before trying to access it
    if timezone is None:
        print("❌ Timezone could not be fetched. Exiting.")
        return None  # Exit gracefully if timezone is not set.

    # Prepare data for .env file
    city_data = [
        f"{city_name.upper()}_BIGQUERY_PROJECT={bigquery_project}\n",
        f"{city_name.upper()}_BIGQUERY_HISTORICAL_DATASET={historical_dataset}\n",
        f"{city_name.upper()}_BIGQUERY_HISTORICAL_TABLE={historical_table}\n",
        f"{city_name.upper()}_BIGQUERY_ROUTES_TABLE={routes_table}\n",
        f"{city_name.upper()}_TIMEZONE={timezone}\n",
        f"{city_name.upper()}_USECASES={usecases}\n",
        f"GOOGLE_API_KEY={api_key}\n" if not check_google_api_key(env_lines) else "",
    ]
    
    return city_data

def setup_city(city_name, env_lines):
    """Setup a city's data in the .env file."""
    if city_exists_in_env(city_name, env_lines):
        print(f"City '{city_name}' already exists in .env file. The following variables are already set:")
        for line in env_lines:
            if line.startswith(city_name.upper()):
                print(line.strip())  # Show old creds
        
        overwrite = input("Do you want to overwrite the existing variables for this city? (Y/N): ").lower()
        if overwrite not in ['y', 'yes']:
            print(f"Skipping city {city_name} setup.")
            return env_lines

    city_data = gather_city_data(city_name, env_lines)
    if city_data is None:
        return env_lines
    
    return update_env_file(env_lines, city_name, city_data)

def main():
    env_file_path = ".env"
    env_lines = read_env_file(env_file_path)

    city_name = input("Enter the name of the city: ")
    
    env_lines = setup_city(city_name, env_lines)
    
    if env_lines is None:
        print("❌ No .env file created. Exiting.")
        return
    
    write_env_file(env_file_path, env_lines)
    
    print(f"\n✅ City {city_name} setup complete!")

if __name__ == "__main__":
    main()