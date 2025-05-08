import pandas as pd
import firebase_admin
from firebase_admin import credentials, firestore
import os
import glob

# --- Firebase Setup ---
SERVICE_ACCOUNT_KEY_PATH = "sensorizacao-e-ambiente-51347-firebase-adminsdk-fbsvc-d6499a3058.json" # Your service account key

try:
    cred = credentials.Certificate(SERVICE_ACCOUNT_KEY_PATH)
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)
    db = firestore.client()
    print("Successfully connected to Firebase Firestore.")
except Exception as e:
    print(f"Error initializing Firebase: {e}")
    exit()

def get_parameter_code_from_prefix(prefix, filename_suffix):
    """
    Maps file prefix and suffix (e.g., _Provincias, _GrandesCuencas) to a standardized parameter code.
    """
    prefix_upper = prefix.upper()
    param_code = ""

    if prefix_upper == "AD25":
        param_code = "AD25mm"
    elif prefix_upper == "AD75":
        param_code = "AD75mm"
    elif prefix_upper == "PADMAX":
        param_code = "ADRmax" # Assumed from previous, and "Generalidades" mentions ADT_R máx
    elif prefix_upper == "ETO":
        param_code = "ETo" # General ETo, suffix will differentiate aggregation
    elif prefix_upper == "PREC":
        param_code = "Precipitacion" # General Precipitation
    else:
        print(f"Warning: Unrecognized parameter prefix '{prefix}'. Using as is.")
        return prefix # Or return None to skip

    # Append aggregation level to parameter code for clarity in Firestore
    if "_Provincias" in filename_suffix:
        return f"{param_code}_Provincias"
    elif "_GrandesCuencas" in filename_suffix:
        return f"{param_code}_GrandesCuencas"
    elif "_ComunidadesAutonomas" in filename_suffix:
        return f"{param_code}_ComunidadesAutonomas"
    elif "_Nacional" in filename_suffix: # Though Nacional might not have monthly values per region
        return f"{param_code}_Nacional"
    else:
        print(f"Warning: Unknown suffix in filename. Using base parameter code: {param_code}")
        return param_code


def process_aemet_csv(csv_filepath, year):
    basename = os.path.basename(csv_filepath)
    parts = basename.split('_') # e.g., ["AD25", "2019", "Provincias.csv"]
    
    if len(parts) < 3 or not parts[1] == str(year):
        print(f"Skipping file {basename}: does not match expected format or year.")
        return

    parameter_prefix = parts[0]
    filename_suffix_parts = parts[2:] # e.g., ["Provincias.csv"] or ["ComunidadesAutonomas.csv"]
    filename_suffix = "_" + "_".join(filename_suffix_parts) # Reconstruct suffix like "_Provincias.csv"

    parameter_code = get_parameter_code_from_prefix(parameter_prefix, filename_suffix)

    if not parameter_code:
        print(f"Skipping file {basename} due to unrecognized parameter prefix or suffix.")
        return

    # We are focusing on regional data, so _Provincias, _GrandesCuencas, _ComunidadesAutonomas are relevant
    # _Nacional files might have a different structure (single row) or no 'región' column.
    # For now, we assume all processed files have a 'región' column.
    if not ("_Provincias" in parameter_code or "_GrandesCuencas" in parameter_code or "_ComunidadesAutonomas" in parameter_code):
        print(f"Skipping file {basename} as it's not a targeted regional aggregation type (Provincias, GrandesCuencas, ComunidadesAutonomas).")
        return

    print(f"\nProcessing file: {basename} for Parameter: {parameter_code}, Year: {year}")

    try:
        try:
            df = pd.read_csv(csv_filepath, sep=';', encoding='utf-8', dtype=str)
        except UnicodeDecodeError:
            df = pd.read_csv(csv_filepath, sep=';', encoding='latin-1', dtype=str)
        
        print(f"Successfully read {basename}. Shape: {df.shape}")

        if df.empty or len(df.columns) < 3:
            print(f"Warning: File {basename} is empty or has too few columns. Skipping.")
            return

        parameter_desc_col = df.columns[0]
        region_col = df.columns[1] # 'región'
        
        # Determine month columns - some files might have an 'anual' column
        month_cols_all = df.columns[2:].tolist()
        month_names_standard = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
        
        # Filter out columns that are not standard month names (e.g., 'anual')
        month_cols = [m for m in month_cols_all if m.strip().lower() in month_names_standard]
        if not month_cols:
            print(f"Warning: No standard month columns found in {basename}. Columns available: {month_cols_all}. Skipping file.")
            return


        batch = db.batch()
        write_count = 0

        for index, row in df.iterrows():
            region_name_original = row[region_col]
            if pd.isna(region_name_original) or not region_name_original.strip():
                continue
            
            # Sanitize region name for use as a document ID
            # Replace '/' and other problematic characters if any
            region_name_sanitized = region_name_original.strip().replace('/', '_').replace('.', '') # Remove dots too

            if not region_name_sanitized:
                print(f"CRITICAL ERROR: region_name_sanitized is empty for row {index+2} in {basename}. Original: '{region_name_original}'")
                continue
            
            parameter_description_from_csv = row[parameter_desc_col].strip()

            monthly_values_data = {}
            has_valid_month_data = False
            for month_name_csv in month_cols: # Iterate only over actual month columns
                month_name_clean = month_name_csv.strip().lower()
                value_str = row[month_name_csv]
                
                if pd.notna(value_str) and value_str.strip():
                    try:
                        monthly_values_data[month_name_clean] = float(value_str.replace(',', '.'))
                        has_valid_month_data = True
                    except ValueError:
                        monthly_values_data[month_name_clean] = None
                else:
                    monthly_values_data[month_name_clean] = None
            
            if not has_valid_month_data:
                continue
            
            # Corrected Firestore Path:
            # Collection('aemetHistoricalData') -> Document(region_name_sanitized)
            #   -> Collection(parameter_code) -> Document(str(year))
            doc_ref = db.collection('aemetHistoricalData').document(region_name_sanitized)\
                        .collection(parameter_code).document(str(year))
            
            # print(f"  Path: aemetHistoricalData/{region_name_sanitized}/{parameter_code}/{str(year)}")


            data_to_upload = {
                "parameterDescriptionCSV": parameter_description_from_csv, # Description from this specific file/row
                "monthlyValues": monthly_values_data,
                "regionOriginal": region_name_original.strip(), # Store original name too
                "year": int(year),
                "parameterCodeUsed": parameter_code, # The generated parameter code
                "sourceFile": basename
            }
            batch.set(doc_ref, data_to_upload)
            write_count += 1
            
            if write_count >= 490:
                print(f"Committing intermediate batch of {write_count} operations for {basename}...")
                batch.commit()
                batch = db.batch()
                write_count = 0
        
        if write_count > 0:
            print(f"Committing final batch of {write_count} operations for {basename}...")
            batch.commit()
        print(f"Finished processing for {basename}.")

    except FileNotFoundError:
        print(f"Error: CSV file not found at {csv_filepath}")
    except Exception as e:
        print(f"An error occurred while processing {csv_filepath}: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    data_root_directory = "./aemetDATA/" 

    if not os.path.isdir(data_root_directory):
        print(f"Error: Data root directory '{data_root_directory}' not found.")
        exit()

    print(f"Starting AEMET data upload from: {os.path.abspath(data_root_directory)}")

    for year_folder_name in os.listdir(data_root_directory):
        year_folder_path = os.path.join(data_root_directory, year_folder_name)
        
        if os.path.isdir(year_folder_path) and year_folder_name.startswith("ebh_estadistica_anual_"):
            try:
                year_str = year_folder_name.split('_')[-1]
                year = int(year_str)
                print(f"\nProcessing year folder: {year_folder_name} for year {year}")

                # Process all relevant CSVs in this year's folder
                # No need for specific glob pattern if we check suffix in get_parameter_code_from_prefix
                all_csv_files_in_year_folder = glob.glob(os.path.join(year_folder_path, "*.csv"))

                if not all_csv_files_in_year_folder:
                    print(f"No CSV files found in {year_folder_path}")
                    continue
                
                for csv_file_path in all_csv_files_in_year_folder:
                    process_aemet_csv(csv_file_path, year) # This function now filters by suffix
            
            except ValueError:
                print(f"Warning: Could not determine year from folder name: {year_folder_name}. Skipping.")
            except Exception as e:
                print(f"An error occurred while processing folder {year_folder_name}: {e}")
        
    print("\nAll AEMET data processing finished.")