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

"""
Environment variable management utilities for the application.
Handles creation of environment files for different parts of the application.
"""

from pathlib import Path


def create_ui_env_file(google_maps_api_key: str, application_mode: str) -> bool:
    """
    Create a .env file in the ui directory with environment variables for Vite.
    
    Args:
        google_maps_api_key (str): The Google Maps API key to include
        application_mode (str): The application mode (demo/production)
    
    Returns:
        bool: True if the file was created successfully, False otherwise
    """
    ui_env_path = Path("ui/.env")
    
    # Prepare environment variables for Vite
    env_content = []
    
    # Add Google Maps API key if available
    if google_maps_api_key:
        env_content.append(f"VITE_GOOGLE_MAPS_API_KEY={google_maps_api_key}")
    
    # Add application mode
    env_content.append(f"VITE_APPLICATION_MODE={application_mode}")
    
    # Write the .env file
    try:
        with open(ui_env_path, "w") as f:
            f.write("\n".join(env_content) + "\n")
        print(f"Created .env file in ui directory with {len(env_content)} variables")
        return True
    except Exception as e:
        print(f"Error creating .env file in ui directory: {e}")
        return False
