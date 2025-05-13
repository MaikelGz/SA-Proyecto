import requests
import firebase_admin
from firebase_admin import credentials, firestore
import os

# === CONFIGURATION ===
# IMPORTANT: Replace with your actual AEMET API Key
AEMET_API_KEY = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0eGRpdnN4dEBnbWFpbC5jb20iLCJqdGkiOiJhZTFmOTcwMy0xZDUwLTRkMTQtYWM2ZS0zNzliNzU0NzA4NDAiLCJpc3MiOiJBRU1FVCIsImlhdCI6MTc0NzEzODg5NiwidXNlcklkIjoiYWUxZjk3MDMtMWQ1MC00ZDE0LWFjNmUtMzc5Yjc1NDcwODQwIiwicm9sZSI6IiJ9.YlInufGbDqYcCsl1vxytknjA6roLVm6S_Gt_yf6MCnQ'
# Path to your Firebase Admin SDK JSON file
FIREBASE_CREDENTIALS_PATH = 'sensorizacao-e-ambiente-51347-firebase-adminsdk-fbsvc-d6499a3058.json' 
# Name of the Firestore collection to store the province-IDEMA mapping
FIRESTORE_COLLECTION_NAME = 'aemetProvinceStationMap'

def initialize_firebase():
    """Initializes Firebase Admin SDK."""
    try:
        cred = credentials.Certificate(FIREBASE_CREDENTIALS_PATH)
        if not firebase_admin._apps: # Initialize only if not already initialized
            firebase_admin.initialize_app(cred)
        db_client = firestore.client()
        print("Successfully connected to Firebase Firestore.")
        return db_client
    except Exception as e:
        print(f"Error initializing Firebase: {e}")
        exit()

def fetch_all_aemet_stations():
    """Fetches all station inventory data from AEMET."""
    print("Fetching all AEMET stations inventory...")
    endpoint = "https://opendata.aemet.es/opendata/api/valores/climatologicos/inventarioestaciones/todasestaciones/"
    headers = {'api_key': AEMET_API_KEY, 'cache-control': "no-cache"}
    
    try:
        response_meta = requests.get(endpoint, headers=headers, verify=True)
        response_meta.raise_for_status()
        metadata = response_meta.json()

        if metadata.get("estado") == 200:
            data_url = metadata.get("datos")
            print(f"Fetching actual station data from: {data_url}")
            response_data = requests.get(data_url, headers={'cache-control': "no-cache"}, verify=True)
            response_data.raise_for_status()
            
            # AEMET data often needs latin-1 decoding
            try:
                stations_json = response_data.json()
            except requests.exceptions.JSONDecodeError:
                # Try decoding with latin-1 if utf-8 fails
                stations_text = response_data.content.decode('latin-1')
                stations_json = requests.utils.json.loads(stations_text)

            print(f"Successfully fetched {len(stations_json)} stations.")
            return stations_json
        else:
            print(f"AEMET API error when fetching station list: {metadata.get('descripcion', 'Unknown error')}")
            return None
    except requests.exceptions.RequestException as e:
        print(f"Request failed when fetching station list: {e}")
        return None
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        return None


def select_one_station_per_province(stations_data):
    if not stations_data:
        return {}
        
    selected_stations = {}
    print("\nSelecting one station per province...")
    
    # --- Sample Station Data (optional, can be removed after confirming fix) ---
    # print("--- Sample Station Data (first 5 stations) ---")
    # for i, station_sample in enumerate(stations_data[:5]):
    #     print(f"Station {i+1}: {station_sample}")
    # print("--- End Sample Station Data ---")
    # --- ---

    for station in stations_data:
        province = station.get('provincia', '').strip().upper()

        if not province:
            continue
            
        if province not in selected_stations:
            # --- CHANGE HERE: Use 'indicativo' as the primary ID ---
            station_id = station.get('indicativo') 
            station_name = station.get('nombre')

            # Ensure essential fields (now station_id and station_name) are present
            if station_id and station_name:
                station_info = {
                    'idema': station_id, # Store it as 'idema' in your Firebase for consistency if you prefer
                                         # or keep it as 'indicativo' if that makes more sense.
                                         # Let's store it as 'idema' for consistency with previous discussions.
                    'indicativo_original': station_id, # Optionally store the original key name
                    'nombre': station_name,
                    'provincia': province, 
                    'latitud': station.get('latitud'),
                    'longitud': station.get('longitud'),
                    'altitud': station.get('altitud'),
                    'indsinop': station.get('indsinop') # Also capture this if available
                }
                selected_stations[province] = station_info
                # print(f"    SELECTED for {province}: {station_info['idema']} ({station_info['indicativo_original']}) - {station_info['nombre']}")
            # else:
                # print(f"  Skipping station for {province} (Indicativo: {station_id}) - Missing indicativo or nombre.")
    
    print(f"Selected {len(selected_stations)} unique provinces with a representative station.")
    return selected_stations

def upload_to_firestore(db_client, data_to_upload):
    """Uploads the selected station data to Firestore."""
    if not data_to_upload:
        print("No data to upload to Firestore.")
        return

    print(f"\nUploading {len(data_to_upload)} province-station mappings to Firestore collection '{FIRESTORE_COLLECTION_NAME}'...")
    batch = db_client.batch()
    count = 0
    skipped_count = 0 

    for province_doc_id_original, station_data in data_to_upload.items(): # Renamed for clarity
        # --- VALIDATION AND SANITIZATION ---
        if not province_doc_id_original or not isinstance(province_doc_id_original, str) or not province_doc_id_original.strip():
            print(f"    SKIPPING: Invalid original province ID (empty or not a string): '{province_doc_id_original}' for station: {station_data.get('nombre')}")
            skipped_count += 1
            continue
        
        # Sanitize the province name for use as a Firestore document ID
        # Replace '/' with '_' and '.' with empty (Firestore doesn't like '.' in IDs if they look like numbers, safer to remove)
        province_doc_id_sanitized = province_doc_id_original.replace('/', '_').replace('.', '')
        
        # After sanitization, check if it became empty (e.g., if original was just "/" or ".")
        if not province_doc_id_sanitized.strip():
            print(f"    SKIPPING: Province ID became empty after sanitization. Original: '{province_doc_id_original}', Station: {station_data.get('nombre')}")
            skipped_count += 1
            continue
            
        print(f"  Processing Original Province ID: '{province_doc_id_original}', Sanitized ID: '{province_doc_id_sanitized}'")
        # --- ---

        try:
            doc_ref = db_client.collection(FIRESTORE_COLLECTION_NAME).document(province_doc_id_sanitized) # USE SANITIZED ID
            
            # Add the sanitized ID to the data being stored if you want to reference it easily
            # station_data['sanitized_id_for_firestore'] = province_doc_id_sanitized 
            
            batch.set(doc_ref, station_data)
            count += 1
            if count > 0 and count % 490 == 0: 
                print(f"    Committing batch of (up to) 490 operations...")
                batch.commit()
                batch = db_client.batch() 
                print(f"    Committed. Continuing with next batch...")
        except ValueError as ve: 
            print(f"    VALUE ERROR creating doc_ref for '{province_doc_id_sanitized}' (Original: '{province_doc_id_original}'): {ve}")
            print(f"    Station data was: {station_data}")
            skipped_count += 1
            continue 
        except Exception as e:
            print(f"    UNEXPECTED ERROR for '{province_doc_id_sanitized}' (Original: '{province_doc_id_original}'): {e}")
            print(f"    Station data was: {station_data}")
            skipped_count += 1
            continue

    if count > 0 and (count % 490 != 0 or (count == len(data_to_upload) - skipped_count and count % 490 == 0)):
        try:
            remaining_ops = count % 490 if count % 490 != 0 else (490 if count > 0 else 0)
            if remaining_ops > 0:
                print(f"    Committing final batch of {remaining_ops} operations...")
                batch.commit()
                print(f"    Final batch committed.")
        except Exception as e:
            print(f"    ERROR committing final batch: {e}")
            # Consider these as skipped for the final count if the batch fails
            # This part is tricky, as some might have succeeded before the error in a partial batch failure
            # For simplicity, we'll assume the remaining items in the current batch failed if this commit fails.
            # A more robust solution would track individual successes/failures within a batch.
            # skipped_count += remaining_ops 


    if skipped_count > 0:
        print(f"Successfully processed {len(data_to_upload) - skipped_count} documents for upload. Skipped {skipped_count} due to errors.")
    elif len(data_to_upload) > 0:
        print(f"All {len(data_to_upload)} documents processed successfully for upload to Firestore.")
    else:
        print("No valid data was processed for upload.")


if __name__ == "__main__":
    # This is the string that would typically be a placeholder in a template
    # It should NOT be your actual API key.
    PLACEHOLDER_API_KEY_STRING = 'YOUR_ACTUAL_AEMET_API_KEY_HERE' 

    # This check is to ensure the user has replaced the placeholder
    if AEMET_API_KEY == PLACEHOLDER_API_KEY_STRING:
        print(f"ERROR: Please replace the placeholder '{PLACEHOLDER_API_KEY_STRING}' with your real AEMET API key in the AEMET_API_KEY variable at the top of the script.")
        exit()
    
    # This check is to ensure the API key isn't just an empty string
    if not AEMET_API_KEY:
        print("ERROR: AEMET_API_KEY variable is empty. Please provide a valid API key.")
        exit()

    if not os.path.exists(FIREBASE_CREDENTIALS_PATH):
        print(f"ERROR: Firebase credentials file not found at '{FIREBASE_CREDENTIALS_PATH}'.")
        exit()

    db = initialize_firebase()
    if db:
        all_stations = fetch_all_aemet_stations()
        if all_stations:
            stations_map = select_one_station_per_province(all_stations)
            upload_to_firestore(db, stations_map)
    print("\nScript finished.")