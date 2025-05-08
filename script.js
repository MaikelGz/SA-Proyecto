// script.js
import { db, auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
// ADD doc and getDoc for fetching specific AEMET documents
import { getDocs, collection, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

// 🔒 Verificar si el usuario está autenticado
onAuthStateChanged(auth, async (user) => { // Make it async to await fetchUserProfileForAemet
    if (!user) {
        window.location.href = "auth.html";
    } else {
        obtenerDatos(); // Solo carga datos si está logueado (original function for live data)
        await fetchUserProfileForAemet(user.uid); // ADDED: To pre-fill AEMET region input
    }
});

// Obtener los contextos de los canvas (original)
const temperatureCtx = document.getElementById('temperatureChart').getContext('2d');
const phCtx = document.getElementById('phChart').getContext('2d');
const humidityCtx = document.getElementById('humidityChart').getContext('2d');

// Crear las variables para los gráficos (original)
let temperatureChart, phChart, humidityChart;

// --- ADDED: DOM Elements for AEMET ---
const aemetRegionInput = document.getElementById('aemet-region-input');
const aemetParameterSelect = document.getElementById('aemet-parameter-select');
const aemetYearSelect = document.getElementById('aemet-year-select');
const fetchAemetDataBtn = document.getElementById('fetch-aemet-data-btn');
const aemetChartCanvas = document.getElementById('aemetChart');
const aemetStatusMessage = document.getElementById('aemet-status-message');
let aemetChartInstance = null; // ADDED: For the AEMET data chart

// --- ADDED: Function to pre-fill AEMET region from user profile ---
async function fetchUserProfileForAemet(userId) {
    if (!userId || !aemetRegionInput) return; // Ensure element exists
    try {
        const userDocRef = doc(db, "usuarios", userId);
        const docSnap = await getDoc(userDocRef);
        if (docSnap.exists()) {
            const profile = docSnap.data();
            if (profile.location) {
                aemetRegionInput.value = profile.location;
            }
        }
    } catch (error) {
        console.error("Error fetching user profile for AEMET prefill:", error);
    }
}


// Función para leer los datos (original function - mostly unchanged)
async function obtenerDatos() {
    try {
        console.log("Iniciando la obtención de datos desde Firestore (sensores)..."); // Clarified log

        const querySnapshot = await getDocs(collection(db, "sensorData"));
        console.log(`Número de documentos de sensor encontrados: ${querySnapshot.size}`);

        const labels = [];
        const temperaturaData = [];
        const phData = [];
        const humedadData = [];

        querySnapshot.forEach((docSnap) => { // Renamed 'doc' to 'docSnap' to avoid conflict if 'doc' is imported
            const data = docSnap.data();
            // console.log(`Documento sensor ${docSnap.id} leído: `, data); // Reduced verbosity

            // ORIGINAL TIMESTAMP HANDLING - Keep as is if it works for your sensor data
            // Ensure 'timestamp' field exists and is a Firestore Timestamp object
            if (data.timestamp && data.timestamp.seconds) {
                 labels.push(new Date(data.timestamp.seconds * 1000).toLocaleString());
            } else if (data.sensor_timestamp && data.sensor_timestamp.toDate) { // Fallback for other timestamp field
                 labels.push(data.sensor_timestamp.toDate().toLocaleString());
            } else {
                labels.push(new Date().toLocaleString()); // Fallback if no timestamp
                console.warn("Document missing expected timestamp field:", docSnap.id, data);
            }
            temperaturaData.push(data.temperatura);
            phData.push(data.ph);
            humedadData.push(data.humedad);
        });

        // console.log("Datos de temperatura:", temperaturaData); // Reduced verbosity
        // console.log("Datos de pH:", phData);
        // console.log("Datos de humedad:", humedadData);

        // Crear el gráfico de temperatura (original)
        if (temperatureChart) {
            temperatureChart.data.labels = labels;
            temperatureChart.data.datasets[0].data = temperaturaData;
            temperatureChart.update();
        } else {
            if(document.getElementById('temperatureChart')) { // Check if canvas exists
                temperatureChart = new Chart(temperatureCtx, { /* ... original chart config ... */ 
                    type: 'line', data: { labels: labels, datasets: [{ label: 'Temperatura (°C)', data: temperaturaData, backgroundColor: 'rgba(255, 99, 132, 0.2)', borderColor: 'rgba(255, 99, 132, 1)', borderWidth: 2, fill: false, tension: 0.4 }] }, options: { responsive: true, scales: { y: { beginAtZero: true } } }
                });
            }
        }

        // Crear el gráfico de pH (original)
        if (phChart) {
            phChart.data.labels = labels;
            phChart.data.datasets[0].data = phData;
            phChart.update();
        } else {
             if(document.getElementById('phChart')) { // Check if canvas exists
                phChart = new Chart(phCtx, { /* ... original chart config ... */ 
                    type: 'line', data: { labels: labels, datasets: [{ label: 'pH', data: phData, backgroundColor: 'rgba(54, 235, 108, 0.2)', borderColor: 'rgb(54, 235, 78)', borderWidth: 2, fill: false, tension: 0.4 }] }, options: { responsive: true, scales: { y: { beginAtZero: true } } }
                });
            }
        }

        // Crear el gráfico de humedad (original)
        if (humidityChart) {
            humidityChart.data.labels = labels;
            humidityChart.data.datasets[0].data = humedadData;
            humidityChart.update();
        } else {
            if(document.getElementById('humidityChart')) { // Check if canvas exists
                humidityChart = new Chart(humidityCtx, { /* ... original chart config ... */ 
                    type: 'line', data: { labels: labels, datasets: [{ label: 'Humedad (%)', data: humedadData, backgroundColor: 'rgba(75, 192, 192, 0.2)', borderColor: 'rgba(75, 192, 192, 1)', borderWidth: 2, fill: false, tension: 0.4 }] }, options: { responsive: true, scales: { y: { beginAtZero: true } } }
                });
            }
        }
        // console.log("Finalizada la obtención de datos de sensor y actualización de gráficos."); // Reduced verbosity

        // Notificaciones (original)
        const notificationDiv = document.getElementById("notifications");
        notificationDiv.innerHTML = ""; // Clear previous notifications

        const lastN = Math.min(20, labels.length); // Ensure lastN is not more than available data
        const getAverage = arr => {
            if (!arr || arr.length === 0) return "N/A";
            const lastValues = arr.slice(-lastN);
            const numericValues = lastValues.filter(v => typeof v === 'number');
            if (numericValues.length === 0) return "N/A";
            const sum = numericValues.reduce((a, b) => a + b, 0);
            return (sum / numericValues.length).toFixed(2);
        };

        const avgTemp = getAverage(temperaturaData);
        if (avgTemp !== "N/A") {
            const tempMsg = document.createElement("p"); tempMsg.style.color = "red";
            tempMsg.textContent = `La temperatura media es de ${avgTemp} °C.`; notificationDiv.appendChild(tempMsg);
        }
        const avgPh = getAverage(phData);
        if (avgPh !== "N/A") {
            const phMsg = document.createElement("p"); phMsg.style.color = "green";
            phMsg.textContent = `El pH medio es de ${avgPh}.`; notificationDiv.appendChild(phMsg);
        }
        const avgHumidity = getAverage(humedadData);
         if (avgHumidity !== "N/A") {
            const humidityMsg = document.createElement("p"); humidityMsg.style.color = "blue";
            humidityMsg.textContent = `La humedad media es de ${avgHumidity}%.`; notificationDiv.appendChild(humidityMsg);
        }
        if (notificationDiv.childElementCount === 0) {
             notificationDiv.textContent = "No hay datos para mostrar promedios.";
        }

        // Original Recommendations (placeholder or your existing logic)
        const recommendationsDiv = document.getElementById("recommendations");
        if (!recommendationsDiv.querySelector('p')) { // Add default if empty
            const p = document.createElement("p");
            p.textContent = "Revisar la humedad si la temperatura sigue aumentando.";
            recommendationsDiv.appendChild(p);
        }


    } catch (error) {
        console.error("Error obteniendo documentos de sensor:", error);
    }
}

// Logout (original, with AEMET chart destruction added)
document.getElementById("logout-btn").addEventListener("click", async () => {
    try {
        await signOut(auth);
        // ADDED: Destroy AEMET chart if it exists
        if (aemetChartInstance) {
            aemetChartInstance.destroy();
            aemetChartInstance = null;
        }
        // Destroy live sensor charts (optional, but good practice)
        if (temperatureChart) { temperatureChart.destroy(); temperatureChart = null; }
        if (phChart) { phChart.destroy(); phChart = null; }
        if (humidityChart) { humidityChart.destroy(); humidityChart = null; }

        window.location.href = "auth.html";
    } catch (error) {
        alert("Error al cerrar sesión: " + error.message);
    }
});

// Llamar la función obtenerDatos() is handled by onAuthStateChanged

// --- ADDED: AEMET Historical Data Viewing Logic ---
async function fetchAndDisplayAemetDataFromButton() { // Renamed to avoid conflict
    const region = aemetRegionInput.value.trim();
    const parameterCode = aemetParameterSelect.value; // e.g., "AD25mm_Provincias"
    const year = aemetYearSelect.value;

    if (!region) {
        aemetStatusMessage.textContent = "Por favor, introduzca una región.";
        aemetStatusMessage.style.color = "red";
        aemetChartCanvas.style.display = 'none';
        if (aemetChartInstance) { aemetChartInstance.destroy(); aemetChartInstance = null; }
        return;
    }

    aemetStatusMessage.textContent = "Cargando datos AEMET...";
    aemetStatusMessage.style.color = "orange";
    aemetChartCanvas.style.display = 'none';
    if (aemetChartInstance) { aemetChartInstance.destroy(); aemetChartInstance = null; }

    const sanitizedRegionName = region.replace('/', '_').replace('.', '');

    try {
        const aemetDocRef = doc(db, `aemetHistoricalData/${sanitizedRegionName}/${parameterCode}/${year}`);
        const docSnap = await getDoc(aemetDocRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            aemetStatusMessage.textContent = `Mostrando: ${data.regionOriginal || region} - ${data.parameterCodeUsed || parameterCode} - ${data.year}`;
            aemetStatusMessage.style.color = "green";
            displayAemetDataAsChart(data.monthlyValues, `${data.parameterCodeUsed || parameterCode} (${data.year})`);
            aemetChartCanvas.style.display = 'block';
        } else {
            aemetStatusMessage.textContent = `No se encontraron datos para: ${region}, ${parameterCode}, ${year}. Verifique la región y selección. (Nombre de región debe coincidir con los datos cargados, ej: 'A CORUÑA', 'DUERO')`;
            aemetStatusMessage.style.color = "red";
        }
    } catch (error) {
        console.error("Error fetching AEMET historical data for display:", error);
        aemetStatusMessage.textContent = "Error al cargar datos AEMET.";
        aemetStatusMessage.style.color = "red";
    }
}

function displayAemetDataAsChart(monthlyValues, chartLabel) {
    const monthOrder = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const labels = [];
    const dataPoints = [];

    monthOrder.forEach(month => {
        labels.push(month.charAt(0).toUpperCase() + month.slice(1));
        dataPoints.push(monthlyValues[month] !== undefined && monthlyValues[month] !== null ? monthlyValues[month] : null);
    });

    const ctx = aemetChartCanvas.getContext('2d');
    if (aemetChartInstance) {
        aemetChartInstance.destroy(); 
    }
    aemetChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: chartLabel,
                data: dataPoints,
                backgroundColor: 'rgba(75, 192, 192, 0.6)',
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { 
                y: { beginAtZero: true, title: { display: true, text: 'Valor' } }, 
                x: { title: { display: true, text: 'Mes' } } 
            },
            plugins: { 
                tooltip: { 
                    callbacks: { 
                        label: function(context) { 
                            let label = context.dataset.label || '';
                            if (label) { label += ': '; }
                            if (context.parsed.y !== null) { label += context.parsed.y; }
                            return label;
                        } 
                    } 
                } 
            }
        }
    });
}

// Add event listener to the AEMET button
if (fetchAemetDataBtn) {
    fetchAemetDataBtn.addEventListener('click', fetchAndDisplayAemetDataFromButton);
}