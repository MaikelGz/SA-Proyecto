// script.js
import { db, auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getDocs, collection, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js"; // Added doc, getDoc
import { signOut } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

// --- Global Chart Variables ---
let temperatureChart, phChart, humidityChart;
let aemetChartInstance = null; 
let currentUserProfile = null;

// --- DOM Elements ---
const mainTitle = document.getElementById('main-title');
const temperatureCtx = document.getElementById('temperatureChart') ? document.getElementById('temperatureChart').getContext('2d') : null;
const phCtx = document.getElementById('phChart') ? document.getElementById('phChart').getContext('2d') : null;
const humidityCtx = document.getElementById('humidityChart') ? document.getElementById('humidityChart').getContext('2d') : null;

const aemetRegionInput = document.getElementById('aemet-region-input');
const aemetParameterSelect = document.getElementById('aemet-parameter-select');
const aemetYearSelect = document.getElementById('aemet-year-select');
const fetchAemetDataBtn = document.getElementById('fetch-aemet-data-btn');
const aemetChartCanvas = document.getElementById('aemetChart');
const aemetStatusMessage = document.getElementById('aemet-status-message');


// --- Authentication and Profile ---
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "auth.html";
    } else {
        currentUserProfile = await fetchUserProfileForPrefill(user.uid); // Fetch profile
        if (currentUserProfile && currentUserProfile.location && mainTitle) {
            mainTitle.textContent = `Monitorización de Salud de la Tierra - ${currentUserProfile.location}`;
        } else if (mainTitle) {
            mainTitle.textContent = `Monitorización de Salud de la Tierra`;
        }
        obtenerDatosSensor(); // Load live sensor data
    }
});

async function fetchUserProfileForPrefill(userId) { // Renamed to be specific for prefill
    if (!userId) return null;
    try {
        const userDocRef = doc(db, "usuarios", userId);
        const docSnap = await getDoc(userDocRef);
        if (docSnap.exists()) {
            const profile = docSnap.data();
            console.log("User profile fetched for prefill:", profile);
            if (profile.location && aemetRegionInput) {
                aemetRegionInput.value = profile.location; // Pre-fill AEMET region text input
            }
            return profile;
        } else {
            console.log("No user profile found for UID:", userId);
        }
    } catch (error) {
        console.error("Error fetching user profile for prefill:", error);
    }
    return null;
}


// --- Live Sensor Data Logic (Original Function you provided) ---
async function obtenerDatosSensor() {
    try {
        console.log("Iniciando la obtención de datos desde Firestore (sensores)...");

        const querySnapshot = await getDocs(collection(db, "sensorData"));
        
        const labels = [];
        const temperaturaData = [];
        const phData = [];
        const humedadData = [];

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            let entryTimestamp;
            // Prioritize your original 'timestamp' field if it exists and is a Firestore Timestamp
            if (data.timestamp && data.timestamp.seconds) { 
                 entryTimestamp = new Date(data.timestamp.seconds * 1000).toLocaleString();
            } else if (data.sensor_timestamp && typeof data.sensor_timestamp.toDate === 'function') { 
                 entryTimestamp = data.sensor_timestamp.toDate().toLocaleString();
            } else { // Ultimate fallback
                entryTimestamp = new Date().toLocaleString(); 
                console.warn("Document missing expected timestamp field, using current time:", docSnap.id, data);
            }
            labels.push(entryTimestamp);
            temperaturaData.push(data.temperatura);
            phData.push(data.ph);
            humedadData.push(data.humedad);
        });

        if (temperatureCtx) {
            if (temperatureChart) { 
                temperatureChart.data.labels = labels; 
                temperatureChart.data.datasets[0].data = temperaturaData; 
                temperatureChart.update(); 
            } else { 
                temperatureChart = new Chart(temperatureCtx, { type: 'line', data: { labels: labels, datasets: [{ label: 'Temperatura (°C)', data: temperaturaData, backgroundColor: 'rgba(255, 99, 132, 0.2)', borderColor: 'rgba(255, 99, 132, 1)', borderWidth: 2, fill: false, tension: 0.4 }] }, options: { responsive: true, scales: { y: { beginAtZero: true } } } }); 
            }
        }
        if (phCtx) {
            if (phChart) { 
                phChart.data.labels = labels; 
                phChart.data.datasets[0].data = phData; 
                phChart.update(); 
            } else { 
                phChart = new Chart(phCtx, { type: 'line', data: { labels: labels, datasets: [{ label: 'pH', data: phData, backgroundColor: 'rgba(54, 235, 108, 0.2)', borderColor: 'rgb(54, 235, 78)', borderWidth: 2, fill: false, tension: 0.4 }] }, options: { responsive: true, scales: { y: { beginAtZero: true } } } }); 
            }
        }
        if (humidityCtx) {
            if (humidityChart) { 
                humidityChart.data.labels = labels; 
                humidityChart.data.datasets[0].data = humedadData; 
                humidityChart.update(); 
            } else { 
                humidityChart = new Chart(humidityCtx, { type: 'line', data: { labels: labels, datasets: [{ label: 'Humedad (%)', data: humedadData, backgroundColor: 'rgba(75, 192, 192, 0.2)', borderColor: 'rgba(75, 192, 192, 1)', borderWidth: 2, fill: false, tension: 0.4 }] }, options: { responsive: true, scales: { y: { beginAtZero: true } } } }); 
            }
        }

        // Notifications (original logic)
        const notificationDiv = document.getElementById("notifications");
        if (notificationDiv) {
            notificationDiv.innerHTML = ""; 
            const lastN = Math.min(20, labels.length);
            const getAverage = arr => {
                if (!arr || arr.length === 0) return "N/A";
                const lastValues = arr.slice(Math.max(0, arr.length - lastN));
                const numericValues = lastValues.filter(v => typeof v === 'number' && !isNaN(v)); // Added isNaN check
                if (numericValues.length === 0) return "N/A";
                const sum = numericValues.reduce((a, b) => a + b, 0);
                return (sum / numericValues.length).toFixed(2);
            };
            const avgTemp = getAverage(temperaturaData); if (avgTemp !== "N/A") { const tempMsg = document.createElement("p"); tempMsg.style.color = "red"; tempMsg.textContent = `La temperatura media es de ${avgTemp} °C.`; notificationDiv.appendChild(tempMsg); }
            const avgPh = getAverage(phData); if (avgPh !== "N/A") { const phMsg = document.createElement("p"); phMsg.style.color = "green"; phMsg.textContent = `El pH medio es de ${avgPh}.`; notificationDiv.appendChild(phMsg); }
            const avgHumidity = getAverage(humedadData); if (avgHumidity !== "N/A") { const humidityMsg = document.createElement("p"); humidityMsg.style.color = "blue"; humidityMsg.textContent = `La humedad media es de ${avgHumidity}%.`; notificationDiv.appendChild(humidityMsg); }
            if (notificationDiv.childElementCount === 0) { notificationDiv.textContent = "No hay datos para mostrar promedios."; }
        }

        // Recommendations (original placeholder logic)
        const recommendationsDiv = document.getElementById("recommendations");
        if (recommendationsDiv && !recommendationsDiv.querySelector('p')) { 
            const p = document.createElement("p");
            p.textContent = "Revisar la humedad si la temperatura sigue aumentando.";
            recommendationsDiv.appendChild(p);
        }

    } catch (error) {
        console.error("Error obteniendo documentos de sensor:", error);
    }
}


// --- AEMET Historical Data Viewing Logic ---
async function fetchAndDisplayAemetDataFromButton() {
    const region = aemetRegionInput ? aemetRegionInput.value.trim() : '';
    const parameterCode = aemetParameterSelect ? aemetParameterSelect.value : '';
    const year = aemetYearSelect ? aemetYearSelect.value : '';

    if (!aemetStatusMessage || !aemetChartCanvas) {
        console.error("AEMET display elements not found.");
        return;
    }

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
            const displayName = data.regionOriginal || sanitizedRegionName; // Use original if available
            aemetStatusMessage.textContent = `Mostrando: ${displayName} - ${data.parameterCodeUsed || parameterCode} - ${data.year}`;
            aemetStatusMessage.style.color = "green";
            displayAemetDataAsChart(data.monthlyValues, `${data.parameterCodeUsed || parameterCode} (${data.year})`);
            aemetChartCanvas.style.display = 'block';
        } else {
            aemetStatusMessage.textContent = `No se encontraron datos para: ${region} (como '${sanitizedRegionName}'), ${parameterCode}, ${year}. Verifique que la región coincida con los datos cargados.`;
            aemetStatusMessage.style.color = "red";
        }
    } catch (error) {
        console.error("Error fetching AEMET historical data for display:", error);
        aemetStatusMessage.textContent = "Error al cargar datos AEMET.";
        aemetStatusMessage.style.color = "red";
    }
}

function displayAemetDataAsChart(monthlyValues, chartLabel) {
    if (!aemetChartCanvas) return;
    const monthOrder = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const labels = [];
    const dataPoints = [];

    monthOrder.forEach(month => {
        labels.push(month.charAt(0).toUpperCase() + month.slice(1));
        const value = (monthlyValues && typeof monthlyValues === 'object' && monthlyValues[month] !== undefined && monthlyValues[month] !== null) 
                      ? monthlyValues[month] 
                      : null;
        dataPoints.push(value);
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
                            else { label += 'N/A';} 
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

// --- Logout ---
const logoutButton = document.getElementById("logout-btn");
if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
        try {
            await signOut(auth);
            if (temperatureChart) { temperatureChart.destroy(); temperatureChart = null; }
            if (phChart) { phChart.destroy(); phChart = null; }
            if (humidityChart) { humidityChart.destroy(); humidityChart = null; }
            if (aemetChartInstance) { aemetChartInstance.destroy(); aemetChartInstance = null; }
            currentUserProfile = null; 
            window.location.href = "auth.html";
        } catch (error) {
            alert("Error al cerrar sesión: " + error.message);
        }
    });
}