import pandas as pd
import firebase_admin
from firebase_admin import credentials, firestore
import os
import glob
import json # For potential pretty printing if needed

# --- Firebase Setup ---
SERVICE_ACCOUNT_KEY_PATH = "sensorizacao-e-ambiente-51347-firebase-adminsdk-fbsvc-d6499a3058.json" 

try:
    cred = credentials.Certificate(SERVICE_ACCOUNT_KEY_PATH)
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)
    db = firestore.client()
    print("Successfully connected to Firebase Firestore.")
except Exception as e:
    print(f"Error initializing Firebase: {e}")
    exit()

# --- Global dictionary to store region info: {sanitized_name: type} ---
ALL_ENCOUNTERED_REGIONS_INFO = {}

def get_region_type_from_suffix(filename_suffix):
    """Determines the region type from the filename suffix."""
    if "_Provincias" in filename_suffix: return "Provincia"
    elif "_GrandesCuencas" in filename_suffix: return "GrandesCuencas"
    elif "_ComunidadesAutonomas" in filename_suffix: return "ComunidadesAutonomas"
    elif "_Nacional" in filename_suffix: return "Nacional"
    else: return "Unknown" # Default if suffix doesn't match

def get_parameter_code_from_prefix(prefix):
    """Maps file prefix to a standardized parameter code (without suffix)."""
    prefix_upper = prefix.upper()
    if prefix_upper == "AD25": return "AD25mm"
    elif prefix_upper == "AD75": return "AD75mm"
    elif prefix_upper == "PADMAX": return "ADRmax"
    elif prefix_upper == "ETO": return "ETo"
    elif prefix_upper == "PREC": return "Precipitacion"
    else:
        print(f"Warning: Unrecognized parameter prefix '{prefix}'. Using as is.")
        return prefix
        
def process_aemet_csv(csv_filepath, year):
    global ALL_ENCOUNTERED_REGIONS_INFO # Use the global dictionary
    basename = os.path.basename(csv_filepath)
    parts = basename.split('_')
    
    if len(parts) < 3 or not parts[1] == str(year):
        # print(f"Skipping file {basename}: does not match expected format or year.")
        return

    parameter_prefix = parts[0]
    filename_suffix = "_" + "_".join(parts[2:])
    
    region_type = get_region_type_from_suffix(filename_suffix)
    base_parameter_code = get_parameter_code_from_prefix(parameter_prefix)
    
    if region_type == "Unknown" or not base_parameter_code:
        print(f"Skipping file {basename} due to unrecognized suffix or prefix.")
        return

    # Construct the parameter code to use for subcollection names (e.g., AD25mm_Provincias)
    parameter_code_with_type = f"{base_parameter_code}_{region_type}"

    # We only process regional files for the main data structure
    is_regional_file = region_type in ["Provincia", "GrandesCuencas", "ComunidadesAutonomas"]
    if not is_regional_file:
         print(f"Skipping file {basename} data upload (type: {region_type}), but will record region name if applicable.")
        # We might still want to record 'Nacional' as a region type if it appears in a file
        # But Nacional files likely don't have a 'región' column to iterate over
        # Let's handle Nacional type specifically if needed later or in metadata update

    print(f"\nProcessing file: {basename} for Param: {base_parameter_code}, Type: {region_type}, Year: {year}")

    try:
        try: df = pd.read_csv(csv_filepath, sep=';', encoding='utf-8', dtype=str)
        except UnicodeDecodeError: df = pd.read_csv(csv_filepath, sep=';', encoding='latin-1', dtype=str)
        
        if df.empty or len(df.columns) < 2: # Need at least param desc and region
            print(f"Warning: File {basename} is empty or has too few columns. Skipping.")
            return
            
        parameter_desc_col = df.columns[0]
        region_col = df.columns[1] # 'región' - Check if Nacional files have this!

        if region_col.strip().lower() != 'región':
             print(f"Warning: Second column in {basename} is not named 'región'. Assuming it's the region column: '{region_col}'.")
             # If Nacional files have a different structure, add specific handling here.


        month_names_standard = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
        month_cols = [m for m in df.columns[2:] if m.strip().lower() in month_names_standard]

        batch = db.batch()
        write_count = 0

        for index, row in df.iterrows():
            region_name_original = row[region_col]
            if pd.isna(region_name_original) or not region_name_original.strip(): continue
            
            region_name_sanitized = region_name_original.strip().replace('/', '_').replace('.', '')
            if not region_name_sanitized: continue

            # --- Store region name and type in the global dictionary ---
            # Store the type found in this file. If seen before, it should be the same.
            if region_name_sanitized not in ALL_ENCOUNTERED_REGIONS_INFO:
                 ALL_ENCOUNTERED_REGIONS_INFO[region_name_sanitized] = region_type
            elif ALL_ENCOUNTERED_REGIONS_INFO[region_name_sanitized] != region_type:
                 # This case should ideally not happen if a region name is unique to its type
                 print(f"Warning: Region '{region_name_sanitized}' found with multiple types: "
                       f"'{ALL_ENCOUNTERED_REGIONS_INFO[region_name_sanitized]}' and '{region_type}'. Check data consistency.")
                 # Decide on precedence or store multiple types if needed (more complex)
            # --- ---
            
            # Only upload data for regional files that have month columns
            if not is_regional_file or not month_cols: continue 

            parameter_description_from_csv = row[parameter_desc_col].strip()
            monthly_values_data = {}
            has_valid_month_data = False
            for month_name_csv in month_cols:
                month_name_clean = month_name_csv.strip().lower()
                value_str = row[month_name_csv]
                if pd.notna(value_str) and value_str.strip():
                    try: monthly_values_data[month_name_clean] = float(value_str.replace(',', '.')) ; has_valid_month_data = True
                    except ValueError: monthly_values_data[month_name_clean] = None
                else: monthly_values_data[month_name_clean] = None
            
            if not has_valid_month_data: continue
            
            # Path uses the combined parameter code + type for the subcollection name
            doc_ref = db.collection('aemetHistoricalData').document(region_name_sanitized)\
                        .collection(parameter_code_with_type).document(str(year))
            
            data_to_upload = {
                "parameterDescriptionCSV": parameter_description_from_csv,
                "monthlyValues": monthly_values_data,
                "regionOriginal": region_name_original.strip(),
                "year": int(year),
                "parameterCodeUsed": parameter_code_with_type, 
                "baseParameter": base_parameter_code, # Store base param
                "regionType": region_type, # Store type
                "sourceFile": basename
            }
            batch.set(doc_ref, data_to_upload)
            write_count += 1
            
            if write_count >= 490:
                print(f"Committing intermediate batch of {write_count} operations for {basename}...")
                batch.commit(); batch = db.batch(); write_count = 0
        
        if write_count > 0:
            print(f"Committing final batch of {write_count} operations for {basename}...")
            batch.commit()
        # print(f"Finished processing data upload for {basename}.") # Less verbose

    except Exception as e:
        print(f"An error occurred while processing {csv_filepath}: {e}")
        import traceback; traceback.print_exc()

def update_regions_metadata():
    global ALL_ENCOUNTERED_REGIONS_INFO
    if not ALL_ENCOUNTERED_REGIONS_INFO:
        print("No regions were encountered during processing. Metadata not updated.")
        return

    print(f"\nUpdating metadata/regions document with {len(ALL_ENCOUNTERED_REGIONS_INFO)} unique regions...")
    
    # Convert the dictionary to a list of objects: [{"id": "sanitized_name", "type": "region_type", "originalName": ???}]
    # We need the original name for display, which isn't directly in our current dict.
    # Let's re-think: store {"id": sanitized, "type": type}
    
    regions_list_for_metadata = []
    for sanitized_name, region_type in ALL_ENCOUNTERED_REGIONS_INFO.items():
        regions_list_for_metadata.append({
            "id": sanitized_name,  # This is the sanitized ID used in Firestore paths
            "type": region_type     # Provincia, GrandesCuencas, etc.
            # We could add 'displayName' here if we find a reliable way to get the original non-sanitized name
        })

    # Sort the list of objects, e.g., by type then by id
    regions_list_for_metadata.sort(key=lambda x: (x['type'], x['id']))

    metadata_doc_ref = db.collection('metadata').document('regionsWithType') # Use a new document name
    try:
        metadata_doc_ref.set({
            'allRegionsInfo': regions_list_for_metadata, # Store the array of objects
            'lastUpdated': firestore.SERVER_TIMESTAMP
        })
        print(f"Successfully updated {metadata_doc_ref.path} document.")
        # Optional: Print the JSON representation for verification
        # print(json.dumps(regions_list_for_metadata, indent=2, ensure_ascii=False)) 
    except Exception as e:
        print(f"Error updating {metadata_doc_ref.path} document: {e}")


if __name__ == "__main__":
    data_root_directory = "./aemetDATA/" 
    # ... (directory check) ...
    print(f"Starting AEMET data upload from: {os.path.abspath(data_root_directory)}")

    for year_folder_name in os.listdir(data_root_directory):
        # ... (process each year folder and CSV file within) ...
         year_folder_path = os.path.join(data_root_directory, year_folder_name)
         if os.path.isdir(year_folder_path) and year_folder_name.startswith("ebh_estadistica_anual_"):
             try:
                 year = int(year_folder_name.split('_')[-1])
                 # print(f"\nProcessing year folder: {year_folder_name} for year {year}")
                 all_csvs = glob.glob(os.path.join(year_folder_path, "*.csv"))
                 if not all_csvs: continue
                 for csv_file in all_csvs: process_aemet_csv(csv_file, year)
             except Exception as e: print(f"Error processing folder {year_folder_name}: {e}")

    update_regions_metadata() # Update metadata after processing all files
    print("\nAll AEMET data processing finished.")