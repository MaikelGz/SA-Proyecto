// script.js
import { db, auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getDocs, collection, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
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

// AEMET Historical Data Elements
const aemetRegionSelect = document.getElementById('aemet-region-select');
const aemetParameterSelect = document.getElementById('aemet-parameter-select');
const aemetYearSelect = document.getElementById('aemet-year-select');
const fetchAemetDataBtn = document.getElementById('fetch-aemet-data-btn');
const aemetChartCanvas = document.getElementById('aemetChart');
const aemetStatusMessage = document.getElementById('aemet-status-message');

// AEMET Real-time Data Elements
const realtimeProvinceSelect = document.getElementById('realtime-province-select'); // This is the <select>
const fetchRealtimeAemetBtn = document.getElementById('fetch-realtime-aemet-btn');
const realtimeAemetStatusMessage = document.getElementById('realtime-aemet-status-message');
const realtimeDataValuesDiv = document.getElementById('realtime-data-values');
const rtStationNameSpan = document.getElementById('rt-station-name');
const rtTimestampSpan = document.getElementById('rt-timestamp');
const rtTempSpan = document.getElementById('rt-temp');
const rtHumiditySpan = document.getElementById('rt-humidity');
const rtPrecipSpan = document.getElementById('rt-precip');


// --- Authentication and Profile ---
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "auth.html";
    } else {
        currentUserProfile = await fetchUserProfile(user.uid);
        if (currentUserProfile?.location && mainTitle) {
            mainTitle.textContent = `Monitorización de Salud de la Tierra - ${currentUserProfile.location}`;
        } else if (mainTitle) {
            mainTitle.textContent = `Monitorización de Salud de la Tierra`;
        }
        obtenerDatosSensor();
        await populateAemetRegionDropdownWithType(); // For historical AEMET
        await populateRealtimeProvinceDropdown();   // For real-time AEMET by province
    }
});

async function fetchUserProfile(userId) {
    // ... (This function should be the same as your last working version)
    if (!userId) return null; try { const userDocRef = doc(db, "usuarios", userId); const docSnap = await getDoc(userDocRef); if (docSnap.exists()) { console.log("User profile fetched:", docSnap.data()); return docSnap.data(); } else { console.log("No user profile found for UID:", userId); } } catch (error) { console.error("Error fetching user profile:", error); } return null;
}

// --- Function to populate AEMET Historical Region Dropdown with Types ---
async function populateAemetRegionDropdownWithType() {
    // ... (This function should be the same as your last working version for historical data)
    if (!aemetRegionSelect) { console.error("AEMET Region Select element not found."); return; } console.log("Populating AEMET historical region dropdown..."); try { aemetRegionSelect.innerHTML = '<option value="">-- Seleccione Región Histórica --</option>'; const regionsMetaDocRef = doc(db, "metadata", "regionsWithType"); const docSnap = await getDoc(regionsMetaDocRef); if (docSnap.exists() && docSnap.data().allRegionsInfo?.length) { const regionsInfoArray = docSnap.data().allRegionsInfo; const regionsByType = {}; regionsInfoArray.forEach(info => { if (info?.id && info.type) { if (!regionsByType[info.type]) regionsByType[info.type] = []; regionsByType[info.type].push(info); } }); const typeOrder = ["Provincia", "ComunidadesAutonomas", "GrandesCuencas", "Nacional", "Unknown"]; typeOrder.forEach(type => { if (regionsByType[type]) { const optgroup = document.createElement('optgroup'); optgroup.label = type; regionsByType[type].sort((a, b) => a.id.localeCompare(b.id, 'es')); regionsByType[type].forEach(info => { const option = document.createElement('option'); option.value = info.id; option.textContent = info.id; optgroup.appendChild(option); }); aemetRegionSelect.appendChild(optgroup); } }); if (currentUserProfile?.location) { const userLocId = currentUserProfile.location.trim().toUpperCase().replace('/', '_').replace('.', ''); if (aemetRegionSelect.querySelector(`option[value="${userLocId}"]`)) aemetRegionSelect.value = userLocId; } console.log("AEMET historical region dropdown populated."); } else { console.warn("Metadata for historical regions not found or empty."); aemetRegionSelect.innerHTML = '<option value="">No hay regiones</option>'; } } catch (error) { console.error("Error populating AEMET historical region dropdown:", error); if (aemetRegionSelect) aemetRegionSelect.innerHTML = '<option value="">Error</option>'; }
}

// --- Function to populate Real-time Province Dropdown ---
async function populateRealtimeProvinceDropdown() {
    if (!realtimeProvinceSelect) {
        console.error("Real-time Province Select element not found.");
        return;
    }
    console.log("Populating Real-time Province dropdown from 'aemetProvinceStationMap'...");
    try {
        realtimeProvinceSelect.innerHTML = '<option value="">-- Seleccione Provincia --</option>';
        // Fetch directly from the aemetProvinceStationMap collection
        const querySnapshot = await getDocs(collection(db, "aemetProvinceStationMap"));
        const provinces = [];
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            // docSnap.id is the Province Name (e.g., "MADRID", "ARABA_ALAVA")
            // data contains { idema: "...", nombre: "..." }
            if (data.idema && data.nombre) { // Ensure essential data is present
                provinces.push({
                    docId: docSnap.id, // This is the sanitized province name used as doc ID
                    displayName: data.provincia, // The original province name stored in the doc
                    stationName: data.nombre,
                    idema: data.idema
                });
            } else {
                console.warn(`Skipping province document ${docSnap.id} due to missing idema or nombre.`);
            }
        });

        // Sort by the original province name for display
        provinces.sort((a, b) => a.displayName.localeCompare(b.displayName, 'es', { sensitivity: 'base' }));

        provinces.forEach(provinceInfo => {
            const option = document.createElement('option');
            option.value = provinceInfo.docId; // Value is the Document ID (sanitized province name)
            option.textContent = `${provinceInfo.displayName} (Estación: ${provinceInfo.stationName})`;
            option.dataset.idema = provinceInfo.idema; // Store IDEMA in a data attribute
            realtimeProvinceSelect.appendChild(option);
        });

        // Set default if user's location (province) matches one in the list
        if (currentUserProfile && currentUserProfile.location) {
            // Sanitize the user's location to match how document IDs were created by the Python script
            const userProvinceSanitized = currentUserProfile.location.trim().toUpperCase().replace('/', '_').replace('.', '');

            if (realtimeProvinceSelect.querySelector(`option[value="${userProvinceSanitized}"]`)) {
                realtimeProvinceSelect.value = userProvinceSanitized;
                console.log(`Set Real-time province default to: ${userProvinceSanitized}`);
            } else {
                console.log(`User location '${userProvinceSanitized}' (from profile: '${currentUserProfile.location}') not found for Real-time province default.`);
            }
        }
        console.log("Real-time Province dropdown populated with", provinces.length, "provinces.");

    } catch (error) {
        console.error("Error populating Real-time Province dropdown:", error);
        if (realtimeProvinceSelect) realtimeProvinceSelect.innerHTML = '<option value="">Error al cargar provincias</option>';
    }
}


// --- Live Sensor Data Logic (Original Function) ---
async function obtenerDatosSensor() {
    // ... (This function should be THE SAME as your last fully working version)
    try { console.log("Iniciando la obtención de datos desde Firestore (sensores)..."); const querySnapshot = await getDocs(collection(db, "sensorData")); const labels = [], temperaturaData = [], phData = [], humedadData = []; querySnapshot.forEach((docSnap) => { const data = docSnap.data(); let entryTimestamp; if (data.sensor_timestamp && typeof data.sensor_timestamp.toDate === 'function') { entryTimestamp = data.sensor_timestamp.toDate().toLocaleString(); } else if (data.timestamp && data.timestamp.seconds) { entryTimestamp = new Date(data.timestamp.seconds * 1000).toLocaleString(); } else { entryTimestamp = new Date().toLocaleString(); console.warn("Document missing expected timestamp field, using current time:", docSnap.id, data); } labels.push(entryTimestamp); temperaturaData.push(typeof data.temperatura === 'number' ? data.temperatura : null); phData.push(typeof data.ph === 'number' ? data.ph : null); humedadData.push(typeof data.humedad === 'number' ? data.humedad : null); }); if (temperatureCtx) { if (temperatureChart) { temperatureChart.data.labels = labels; temperatureChart.data.datasets[0].data = temperaturaData; temperatureChart.update(); } else { temperatureChart = new Chart(temperatureCtx, { type: 'line', data: { labels: labels, datasets: [{ label: 'Temperatura (°C)', data: temperaturaData, backgroundColor: 'rgba(255, 99, 132, 0.2)', borderColor: 'rgba(255, 99, 132, 1)', borderWidth: 2, fill: false, tension: 0.4 }] }, options: { responsive: true, scales: { y: { beginAtZero: true } } } }); } } if (phCtx) { if (phChart) { phChart.data.labels = labels; phChart.data.datasets[0].data = phData; phChart.update(); } else { phChart = new Chart(phCtx, { type: 'line', data: { labels: labels, datasets: [{ label: 'pH', data: phData, backgroundColor: 'rgba(54, 235, 108, 0.2)', borderColor: 'rgb(54, 235, 78)', borderWidth: 2, fill: false, tension: 0.4 }] }, options: { responsive: true, scales: { y: { beginAtZero: true } } } }); } } if (humidityCtx) { if (humidityChart) { humidityChart.data.labels = labels; humidityChart.data.datasets[0].data = humedadData; humidityChart.update(); } else { humidityChart = new Chart(humidityCtx, { type: 'line', data: { labels: labels, datasets: [{ label: 'Humedad (%)', data: humedadData, backgroundColor: 'rgba(75, 192, 192, 0.2)', borderColor: 'rgba(75, 192, 192, 1)', borderWidth: 2, fill: false, tension: 0.4 }] }, options: { responsive: true, scales: { y: { beginAtZero: true } } } }); } } const notificationDiv = document.getElementById("notifications"); if (notificationDiv) { notificationDiv.innerHTML = ""; const lastN = Math.min(20, labels.length); const getAverage = arr => { if (!arr || arr.length === 0) return "N/A"; const lastValues = arr.slice(Math.max(0, arr.length - lastN)); const numericValues = lastValues.filter(v => typeof v === 'number'); if (numericValues.length === 0) return "N/A"; const sum = numericValues.reduce((a, b) => a + b, 0); return (sum / numericValues.length).toFixed(2); }; const avgTemp = getAverage(temperaturaData); if (avgTemp !== "N/A") { const tempMsg = document.createElement("p"); tempMsg.style.color = "red"; tempMsg.textContent = `La temperatura media es de ${avgTemp} °C.`; notificationDiv.appendChild(tempMsg); } const avgPh = getAverage(phData); if (avgPh !== "N/A") { const phMsg = document.createElement("p"); phMsg.style.color = "green"; phMsg.textContent = `El pH medio es de ${avgPh}.`; notificationDiv.appendChild(phMsg); } const avgHumidity = getAverage(humedadData); if (avgHumidity !== "N/A") { const humidityMsg = document.createElement("p"); humidityMsg.style.color = "blue"; humidityMsg.textContent = `La humedad media es de ${avgHumidity}%.`; notificationDiv.appendChild(humidityMsg); } if (notificationDiv.childElementCount === 0) { notificationDiv.textContent = "No hay datos para mostrar promedios."; } } const recommendationsDiv = document.getElementById("recommendations"); if (recommendationsDiv && recommendationsDiv.children.length === 0) { const p = document.createElement("p"); p.textContent = "Revisar la humedad si la temperatura sigue aumentando."; recommendationsDiv.appendChild(p); } } catch (error) { console.error("Error obteniendo documentos de sensor:", error); }
}

// --- AEMET Historical Data Viewing Logic ---
async function fetchAndDisplayAemetDataFromButton() {
    // ... (This function should be THE SAME as your last fully working version)
    const region = aemetRegionSelect ? aemetRegionSelect.value : ''; const parameterCode = aemetParameterSelect ? aemetParameterSelect.value : ''; const year = aemetYearSelect ? aemetYearSelect.value : ''; if (!aemetStatusMessage || !aemetChartCanvas) { console.error("AEMET display elements not found."); return; } if (!region) { aemetStatusMessage.textContent = "Por favor, seleccione una región."; aemetStatusMessage.style.color = "red"; aemetChartCanvas.style.display = 'none'; if (aemetChartInstance) { aemetChartInstance.destroy(); aemetChartInstance = null; } return; } if (!parameterCode) { aemetStatusMessage.textContent = "Por favor, seleccione un parámetro."; aemetStatusMessage.style.color = "red"; return; } if (!year) { aemetStatusMessage.textContent = "Por favor, seleccione un año."; aemetStatusMessage.style.color = "red"; return; } aemetStatusMessage.textContent = "Cargando datos AEMET..."; aemetStatusMessage.style.color = "orange"; aemetChartCanvas.style.display = 'none'; if (aemetChartInstance) { aemetChartInstance.destroy(); aemetChartInstance = null; } const selectedRegionDocId = region; try { const aemetDocPath = `aemetHistoricalData/${selectedRegionDocId}/${parameterCode}/${year}`; console.log("Attempting to fetch AEMET historical data from path:", aemetDocPath); const aemetDocRef = doc(db, aemetDocPath); const docSnap = await getDoc(aemetDocRef); if (docSnap.exists()) { const data = docSnap.data(); if (data?.monthlyValues) { const displayName = data.regionOriginal || selectedRegionDocId; const displayParam = data.parameterCodeUsed || parameterCode; aemetStatusMessage.textContent = `Mostrando: ${displayName} - ${displayParam} - ${data.year}`; aemetStatusMessage.style.color = "green"; displayAemetDataAsChart(data.monthlyValues, `${displayParam} (${data.year})`); aemetChartCanvas.style.display = 'block'; } else { console.error("Historical document exists but missing 'monthlyValues':", data); aemetStatusMessage.textContent = `Datos incompletos para: ${selectedRegionDocId}, ${parameterCode}, ${year}.`; aemetStatusMessage.style.color = "red"; } } else { aemetStatusMessage.textContent = `No se encontraron datos para: ${selectedRegionDocId}, ${parameterCode}, ${year}.`; aemetStatusMessage.style.color = "red"; } } catch (error) { console.error("Error fetching AEMET historical data for display:", error); aemetStatusMessage.textContent = "Error al cargar datos AEMET."; aemetStatusMessage.style.color = "red"; }
}
function displayAemetDataAsChart(monthlyValues, chartLabel) {
    // ... (This function should be THE SAME as your last fully working version)
    if (!aemetChartCanvas) return; const monthOrder = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]; const labels = []; const dataPoints = []; monthOrder.forEach(month => { labels.push(month.charAt(0).toUpperCase() + month.slice(1)); const value = (monthlyValues && typeof monthlyValues === 'object' && monthlyValues[month] !== undefined && monthlyValues[month] !== null) ? monthlyValues[month] : null; dataPoints.push(value); }); const ctx = aemetChartCanvas.getContext('2d'); if (aemetChartInstance) { aemetChartInstance.destroy(); } aemetChartInstance = new Chart(ctx, { type: 'bar', data: { labels: labels, datasets: [{ label: chartLabel, data: dataPoints, backgroundColor: 'rgba(75, 192, 192, 0.6)', borderColor: 'rgba(75, 192, 192, 1)', borderWidth: 1 }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, title: { display: true, text: 'Valor' } }, x: { title: { display: true, text: 'Mes' } } }, plugins: { tooltip: { callbacks: { label: function (context) { let label = context.dataset.label || ''; if (label) { label += ': '; } if (context.parsed.y !== null) { label += context.parsed.y; } else { label += 'N/A'; } return label; } } } } } });
}
if (fetchAemetDataBtn) { // For historical AEMET data
    fetchAemetDataBtn.addEventListener('click', fetchAndDisplayAemetDataFromButton);
}


// --- Real-time AEMET Observation Logic ---
async function SIMULATED_getAemetRealtimeObservation(idema) {
    // ... (This function should be THE SAME as your last working version - the simulation)
    console.log(`SIMULATING AEMET API call for IDEMA: ${idema}`); await new Promise(resolve => setTimeout(resolve, 500)); const example_data_latest = { "idema": "2517A", "lon": -4.939637, "fint": "2025-05-13T10:00:00+0000", "prec": 0.0, "ubi": "FUENTE EL SOL", "hr": 48.0, "ta": 15.4 }; if (idema === "2517A") { return { status: 200, data: [example_data_latest], description: "Éxito (simulado)" }; } else if (idema === "9999X") { return { status: 404, data: null, description: "Estación no encontrada (simulado)" }; } else { const now = new Date(); const randomTemp = (Math.random() * 20 + 5).toFixed(1); const randomHr = Math.floor(Math.random() * 60 + 40); const randomPrec = Math.random() < 0.2 ? (Math.random() * 5).toFixed(1) : 0.0; return { status: 200, data: [{ "idema": idema, "fint": now.toISOString(), "prec": parseFloat(randomPrec), "ubi": `ESTACIÓN SIMULADA ${idema}`, "hr": parseFloat(randomHr), "ta": parseFloat(randomTemp) }], description: "Éxito (simulado genérico)" }; }
}

async function handleFetchRealtimeAemet() {
    // ... (This function should be THE SAME as your last working version, using selectedOption.dataset.idema)
    if (!realtimeProvinceSelect || !realtimeAemetStatusMessage || !realtimeDataValuesDiv) return; const selectedOption = realtimeProvinceSelect.options[realtimeProvinceSelect.selectedIndex]; const provinceName = selectedOption.value; const idema = selectedOption.dataset.idema; if (!provinceName || !idema) { realtimeAemetStatusMessage.textContent = "Por favor, seleccione una provincia válida."; realtimeAemetStatusMessage.style.color = "red"; realtimeDataValuesDiv.style.display = 'none'; return; } realtimeAemetStatusMessage.textContent = `Cargando datos para estación en ${provinceName} (IDEMA: ${idema})...`; realtimeAemetStatusMessage.style.color = "orange"; realtimeDataValuesDiv.style.display = 'none'; const response = await SIMULATED_getAemetRealtimeObservation(idema); if (response?.status === 200 && response.data?.length > 0) { const latestObservation = response.data[response.data.length - 1]; realtimeAemetStatusMessage.textContent = `Datos recibidos para ${latestObservation.ubi || provinceName} (${response.description})`; realtimeAemetStatusMessage.style.color = "green"; if (rtStationNameSpan) rtStationNameSpan.textContent = latestObservation.ubi || "Desconocido"; if (rtTimestampSpan) rtTimestampSpan.textContent = latestObservation.fint ? new Date(latestObservation.fint).toLocaleString() : "N/A"; if (rtTempSpan) rtTempSpan.textContent = latestObservation.ta !== undefined ? latestObservation.ta.toFixed(1) : "N/A"; if (rtHumiditySpan) rtHumiditySpan.textContent = latestObservation.hr !== undefined ? latestObservation.hr.toFixed(0) : "N/A"; if (rtPrecipSpan) rtPrecipSpan.textContent = latestObservation.prec !== undefined ? latestObservation.prec.toFixed(1) : "N/A"; realtimeDataValuesDiv.style.display = 'block'; } else { realtimeAemetStatusMessage.textContent = `Error o no hay datos para IDEMA ${idema} en ${provinceName}: ${response ? response.description : 'Respuesta no válida'} (Simulado)`; realtimeAemetStatusMessage.style.color = "red"; realtimeDataValuesDiv.style.display = 'none'; }
}

if (fetchRealtimeAemetBtn) { // For real-time AEMET data
    fetchRealtimeAemetBtn.addEventListener('click', handleFetchRealtimeAemet);
}

// --- Logout ---
const logoutButton = document.getElementById("logout-btn");
if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
        // ... (This function should be THE SAME as your last working version)
        try { await signOut(auth); if (temperatureChart) { temperatureChart.destroy(); temperatureChart = null; } if (phChart) { phChart.destroy(); phChart = null; } if (humidityChart) { humidityChart.destroy(); humidityChart = null; } if (aemetChartInstance) { aemetChartInstance.destroy(); aemetChartInstance = null; } currentUserProfile = null; window.location.href = "auth.html"; } catch (error) { alert("Error al cerrar sesión: " + error.message); }
    });
}