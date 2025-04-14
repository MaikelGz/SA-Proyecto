import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-analytics.js";

// Configuración de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyALV4zpwSw4nhaCndmdSsPzym4u0vz9oN0",
    authDomain: "sensorizacao-e-ambiente-51347.firebaseapp.com",
    projectId: "sensorizacao-e-ambiente-51347",
    storageBucket: "sensorizacao-e-ambiente-51347.appspot.com",
    messagingSenderId: "78342438251",
    appId: "1:78342438251:web:ed4b7b2814665765a2202e",
    measurementId: "G-W27G3ZKVJW"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

// Obtener los contextos de los canvas
const temperatureCtx = document.getElementById('temperatureChart').getContext('2d');
const phCtx = document.getElementById('phChart').getContext('2d');
const humidityCtx = document.getElementById('humidityChart').getContext('2d');

// Crear las variables para los gráficos
let temperatureChart, phChart, humidityChart;

// Función para leer los datos
async function obtenerDatos() {
    try {
        console.log("Iniciando la obtención de datos desde Firestore...");

        const querySnapshot = await getDocs(collection(db, "sensorData"));
        console.log(`Número de documentos encontrados: ${querySnapshot.size}`);

        const labels = [];
        const temperaturaData = [];
        const phData = [];
        const humedadData = [];

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            console.log(`Documento ${doc.id} leído: `, data);

            labels.push(new Date(data.timestamp.seconds * 1000).toLocaleString()); // timestamp más bonito
            temperaturaData.push(data.temperatura);
            phData.push(data.ph);
            humedadData.push(data.humedad);

            // Mostrar en notificaciones
            const notificationDiv = document.getElementById("notifications");
            const p = document.createElement("p");
            p.textContent = `Sensor ${doc.id}: ${JSON.stringify(data)}`;
            notificationDiv.appendChild(p);
        });

        console.log("Datos de temperatura:", temperaturaData);
        console.log("Datos de pH:", phData);
        console.log("Datos de humedad:", humedadData);

        // Crear el gráfico de temperatura
        if (temperatureChart) {
            console.log("Actualizando gráfico de temperatura...");
            temperatureChart.data.labels = labels;
            temperatureChart.data.datasets[0].data = temperaturaData;
            temperatureChart.update();
        } else {
            console.log("Creando gráfico de temperatura...");
            temperatureChart = new Chart(temperatureCtx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Temperatura (°C)',
                            data: temperaturaData,
                            backgroundColor: 'rgba(255, 99, 132, 0.2)',
                            borderColor: 'rgba(255, 99, 132, 1)',
                            borderWidth: 2,
                            fill: false,
                            tension: 0.4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    scales: {
                        y: { beginAtZero: true }
                    }
                }
            });
        }

        // Crear el gráfico de pH
        if (phChart) {
            console.log("Actualizando gráfico de pH...");
            phChart.data.labels = labels;
            phChart.data.datasets[0].data = phData;
            phChart.update();
        } else {
            console.log("Creando gráfico de pH...");
            phChart = new Chart(phCtx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'pH',
                            data: phData,
                            backgroundColor: 'rgba(54, 235, 108, 0.2)',
                            borderColor: 'rgb(54, 235, 78)',
                            borderWidth: 2,
                            fill: false,
                            tension: 0.4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    scales: {
                        y: { beginAtZero: true }
                    }
                }
            });
        }

        // Crear el gráfico de humedad
        if (humidityChart) {
            console.log("Actualizando gráfico de humedad...");
            humidityChart.data.labels = labels;
            humidityChart.data.datasets[0].data = humedadData;
            humidityChart.update();
        } else {
            console.log("Creando gráfico de humedad...");
            humidityChart = new Chart(humidityCtx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Humedad (%)',
                            data: humedadData,
                            backgroundColor: 'rgba(75, 192, 192, 0.2)',
                            borderColor: 'rgba(75, 192, 192, 1)',
                            borderWidth: 2,
                            fill: false,
                            tension: 0.4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    scales: {
                        y: { beginAtZero: true }
                    }
                }
            });
        }

        console.log("Finalizada la obtención de datos y actualización de gráficos.");

    } catch (error) {
        console.error("Error obteniendo documentos:", error);
    }
}

// Llamar la función
obtenerDatos();
