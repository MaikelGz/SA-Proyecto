// script.js
import { db, auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getDocs, collection } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";


// 🔒 Verificar si el usuario está autenticado
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "auth.html";
    } else {
        obtenerDatos(); // Solo carga datos si está logueado
    }
});
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
            //const notificationDiv = document.getElementById("notifications");
            //const p = document.createElement("p");
            //p.textContent = `Sensor ${doc.id}: ${JSON.stringify(data)}`;
            //notificationDiv.appendChild(p);
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

        console.log("Agregamos ahroa a notificaciones las medias");

        
        const lastN = 20; // Mostrar promedios de los últimos 20 valores

        const getAverage = arr => {
            const lastValues = arr.slice(-lastN);
            const sum = lastValues.reduce((a, b) => a + b, 0);
            return (sum / lastValues.length).toFixed(2);
        };

        const avgTemp = getAverage(temperaturaData);
        const avgPh = getAverage(phData);
        const avgHumidity = getAverage(humedadData);

        const notificationDiv = document.getElementById("notifications");

        const tempMsg = document.createElement("p");
        tempMsg.style.color = "red";
        tempMsg.textContent = `La temperatura media es de ${avgTemp} °C.`;
        notificationDiv.appendChild(tempMsg);

        const phMsg = document.createElement("p");
        phMsg.style.color = "green";
        phMsg.textContent = `El pH medio es de ${avgPh}.`;
        notificationDiv.appendChild(phMsg);

        const humidityMsg = document.createElement("p");
        humidityMsg.style.color = "blue";
        humidityMsg.textContent = `La humedad media es de ${avgHumidity}%.`;
        notificationDiv.appendChild(humidityMsg);

    } catch (error) {
        console.error("Error obteniendo documentos:", error);
    }
}

document.getElementById("logout-btn").addEventListener("click", async () => {
    try {
        await signOut(auth);
        window.location.href = "auth.html";
    } catch (error) {
        alert("Error al cerrar sesión: " + error.message);
    }
});

// Llamar la función
obtenerDatos();
