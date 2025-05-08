import firebase_admin
from firebase_admin import credentials, firestore
import random
import time

# Inicializar la app de Firebase
cred = credentials.Certificate("sensorizacao-e-ambiente-51347-firebase-adminsdk-fbsvc-d6499a3058.json")
firebase_admin.initialize_app(cred)

db = firestore.client()

def generate_data():
    return {
        'temperatura': round(random.uniform(20, 40), 2),  # 20°C a 40°C
        'humedad': round(random.uniform(50, 90), 2),       # 50% a 90%
        'ph': round(random.uniform(6.0, 8.0), 2),          # pH entre 6 y 8
        'timestamp': firestore.SERVER_TIMESTAMP           # Tiempo del servidor
    }

# Subir 10 datos de ejemplo
for i in range(10):
    data = generate_data()
    db.collection('sensorData').add(data)
    print(f'Dato {i+1} subido:', data)
    time.sleep(1)  # Espera 1 segundo entre cargas
