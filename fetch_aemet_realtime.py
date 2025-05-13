import firebase_admin
from firebase_admin import credentials, firestore
import requests
import json
import os
from datetime import datetime

# --- Configuration ---
# Path to your Firebase service account key JSON file
SERVICE_ACCOUNT_KEY_PATH = "sensorizacao-e-ambiente-51347-firebase-adminsdk-fbsvc-d6499a3058.json"
# Path to your AEMET API key file
AEMET_API_KEY_PATH = "api_key.txt"
# AEMET station ID (IDEMA) for the selected region.
# You need to find the IDEMA for your specific region/station of interest.
# Example: '9434' (Madrid, Ciudad Universitaria) - REPLACE WITH YOUR TARGET STATION ID
SELECTED_STATION_IDEMA = "YOUR_STATION_IDEMA_HERE" # IMPORTANT: Update this

# --- Firebase Setup ---
try:
    cred = credentials.Certificate(SERVICE_ACCOUNT_KEY_PATH)
    if not firebase_admin._apps: # Check if already initialized
        firebase_admin.initialize_app(cred)
    db = firestore.client()
    print("Successfully connected to Firebase Firestore.")
except Exception as e:
    print(f"Error initializing Firebase: {e}")
    exit()

# --- Function to read AEMET API Key ---
def get_aemet_api_key(filepath):
    """Reads the AEMET API key from the specified file."""
    try:
        with open(filepath, 'r') as f:
            api_key = f.read().strip()
        if not api_key:
            print(f"Error: API key file '{filepath}' is empty.")
            return None
        return api_key
    except FileNotFoundError:
        print(f"Error: API key file '{filepath}' not found.")
        return None
    except Exception as e:
        print(f"Error reading API key from '{filepath}': {e}")
        return None

# --- Function to fetch real-time data from AEMET ---
def fetch_aemet_station_data(api_key, station_idema):
    """
    Fetches the latest conventional observation data for a specific AEMET station.
    AEMET API often requires two requests: one to get a URL for the data,
    and a second to fetch the actual data from that URL.
    """
    if not api_key:
        print("AEMET API key is missing.")
        return None

    initial_url = f"https://opendata.aemet.es/opendata/api/observacion/convencional/datos/estacion/{station_idema}"
    
    # Using api_key as a query parameter, which is common for AEMET
    params = {
        'api_key': api_key
    }
    # Standard headers for JSON
    headers = {
        'accept': "application/json"
    }

    print(f"Fetching data URL from AEMET for station: {station_idema}...")
    try:
        # First request to get the URL for the actual data
        response_initial = requests.get(initial_url, headers=headers, params=params)
        response_initial.raise_for_status()
        
        data_initial = response_initial.json()
        
        if data_initial.get("estado") == 200:
            data_url = data_initial.get("datos")
            print(f"Successfully obtained data URL: {data_url}")
            
            # Second request to get the actual data
            # No api_key param needed for this direct data_url, but headers might be good practice
            print("Fetching actual data from AEMET...")
            response_data = requests.get(data_url, headers=headers) 
            response_data.raise_for_status()
            
            try:
                actual_data = response_data.json()
            except json.JSONDecodeError:
                print("JSONDecodeError with UTF-8, trying with latin-1 encoding...")
                actual_data = json.loads(response_data.content.decode('latin-1', errors='ignore'))

            print("Successfully fetched actual data.")
            return actual_data
            
        elif data_initial.get("estado") == 401:
            print(f"Error: Unauthorized. Check your AEMET API key. Description: {data_initial.get('descripcion')}")
            return None
        elif data_initial.get("estado") == 404:
             print(f"Error: Not Found. Possibly invalid station ID '{station_idema}' or endpoint. Description: {data_initial.get('descripcion')}")
             return None
        elif data_initial.get("estado") == 429:
            print(f"Error: Too Many Requests. API rate limit exceeded. Description: {data_initial.get('descripcion')}")
            return None
        else:
            print(f"Error fetching data from AEMET. Status: {data_initial.get('estado')}, Description: {data_initial.get('descripcion')}")
            return None

    except requests.exceptions.RequestException as e:
        print(f"RequestException during AEMET API call: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"Response content: {e.response.text}")
        return None
    except json.JSONDecodeError as e:
        print(f"JSONDecodeError parsing AEMET response: {e}")
        # Log the content that failed to parse for debugging
        if 'response_initial' in locals() and response_initial:
             print(f"Initial Response content that caused error: {response_initial.text}")
        if 'response_data' in locals() and response_data:
             print(f"Data Response content that caused error: {response_data.text}")
        return None
    except Exception as e:
        print(f"An unexpected error occurred during AEMET API call: {e}")
        return None

# --- Function to extract precipitation and update Firebase ---
def process_and_upload_precipitation(station_idema, station_data_list):
    """
    Processes the station data to find precipitation and uploads it to Firebase.
    The AEMET station data endpoint returns a list of observations.
    """
    if not station_data_list or not isinstance(station_data_list, list) or len(station_data_list) == 0:
        print("No station data, data is not in expected list format, or list is empty.")
        return

    latest_observation = station_data_list[0] # AEMET usually returns the latest as the first element
    
    observation_time_utc_str = latest_observation.get('fint')
    precipitation_mm = latest_observation.get('prec', 0.0) 
    location_name = latest_observation.get('ubi', station_idema) 

    if observation_time_utc_str is None:
        print("Observation timestamp ('fint') not found in data. Skipping Firebase update for this entry.")
        print(f"Problematic observation data: {latest_observation}")
        return

    try:
        # Prepare data for Firebase
        data_to_upload = {
            'stationIdema': station_idema,
            'locationName': location_name,
            'observationTimeUTC': observation_time_utc_str, # Storing as ISO string
            'precipitation_mm': float(precipitation_mm), 
            'lastUpdatedFirebase': firestore.SERVER_TIMESTAMP 
        }
        
        doc_ref = db.collection('aemetRealtimePrecipitation').document(station_idema)
        doc_ref.set(data_to_upload) # Overwrites the document with the latest observation
        
        print(f"Successfully uploaded precipitation data to Firebase for station {station_idema}:")
        print(f"  Time (UTC): {observation_time_utc_str}, Precipitation: {precipitation_mm} mm")

    except Exception as e:
        print(f"Error processing data or uploading to Firebase: {e}")
        print(f"Data being processed: {latest_observation}")


# --- Main Execution ---
if __name__ == "__main__":
    print(f"--- Starting AEMET Real-time Precipitation Script ({datetime.now()}) ---")
    
    if SELECTED_STATION_IDEMA == "YOUR_STATION_IDEMA_HERE" or not SELECTED_STATION_IDEMA:
        print("CRITICAL ERROR: 'SELECTED_STATION_IDEMA' is not set. Please update the script.")
        exit()

    aemet_api_key = get_aemet_api_key(AEMET_API_KEY_PATH)

    if aemet_api_key:
        print(f"Using AEMET API Key from: {AEMET_API_KEY_PATH}")
        
        station_data = fetch_aemet_station_data(aemet_api_key, SELECTED_STATION_IDEMA)
        
        if station_data:
            process_and_upload_precipitation(SELECTED_STATION_IDEMA, station_data)
        else:
            print(f"Failed to retrieve or process data for station {SELECTED_STATION_IDEMA}. Firebase not updated.")
    else:
        print("Failed to load AEMET API Key. Cannot proceed. Exiting.")

    print(f"--- Script finished ({datetime.now()}) ---\n")