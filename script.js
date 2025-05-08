// script.js
import { db, auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getDocs, collection, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

// --- Global Chart Variables ---
let temperatureChart, phChart, humidityChart; // For live sensor data
let aemetChartInstance = null; // For the AEMET data chart
let currentUserProfile = null; // To store fetched user profile

// --- DOM Elements ---
const mainTitle = document.getElementById('main-title');
// Live sensor data canvases (assuming these are constant)
const temperatureCtx = document.getElementById('temperatureChart') ? document.getElementById('temperatureChart').getContext('2d') : null;
const phCtx = document.getElementById('phChart') ? document.getElementById('phChart').getContext('2d') : null;
const humidityCtx = document.getElementById('humidityChart') ? document.getElementById('humidityChart').getContext('2d') : null;

// AEMET specific DOM Elements
const aemetRegionSelect = document.getElementById('aemet-region-select'); // This is now a <select>
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
        // Fetch user profile first to use for defaults
        currentUserProfile = await fetchUserProfile(user.uid);

        if (currentUserProfile?.location && mainTitle) {
            mainTitle.textContent = `Monitorización de Salud de la Tierra - ${currentUserProfile.location}`;
        } else if (mainTitle) {
            mainTitle.textContent = `Monitorización de Salud de la Tierra`;
        }

        obtenerDatosSensor(); // Load live sensor data
        await populateAemetRegionDropdownWithType(); // Populate AEMET dropdown with types
    }
});

async function fetchUserProfile(userId) {
    if (!userId) return null;
    try {
        const userDocRef = doc(db, "usuarios", userId);
        const docSnap = await getDoc(userDocRef);
        if (docSnap.exists()) {
            console.log("User profile fetched:", docSnap.data());
            return docSnap.data();
        } else {
            console.log("No user profile found for UID:", userId);
        }
    } catch (error) {
        console.error("Error fetching user profile:", error);
    }
    return null;
}


// --- Function to populate AEMET Region Dropdown with Types ---
async function populateAemetRegionDropdownWithType() {
    if (!aemetRegionSelect) {
        console.error("AEMET Region Select element not found in DOM.");
        return;
    }
    console.log("Populating AEMET region dropdown with types from metadata...");
    try {
        // Clear existing options and add placeholder
        aemetRegionSelect.innerHTML = '<option value="">-- Seleccione una Región --</option>';

        // Fetch the metadata document containing the array of region objects
        const regionsMetaDocRef = doc(db, "metadata", "regionsWithType"); // Use the new document name
        const docSnap = await getDoc(regionsMetaDocRef);

        if (docSnap.exists() && docSnap.data().allRegionsInfo && Array.isArray(docSnap.data().allRegionsInfo)) {
            const regionsInfoArray = docSnap.data().allRegionsInfo; // Array of {id: "...", type: "..."}
            console.log("Fetched regions info from metadata:", regionsInfoArray.length);

            // Group regions by type for <optgroup>
            const regionsByType = {};
            regionsInfoArray.forEach(regionInfo => {
                // Basic validation of the region info object
                if (typeof regionInfo === 'object' && regionInfo !== null && regionInfo.id && regionInfo.type) {
                    if (!regionsByType[regionInfo.type]) {
                        regionsByType[regionInfo.type] = [];
                    }
                    regionsByType[regionInfo.type].push(regionInfo);
                } else {
                    console.warn("Skipping invalid region info object in metadata:", regionInfo);
                }
            });

            // Define desired order for optgroups
            const typeOrder = ["Provincia", "ComunidadesAutonomas", "GrandesCuencas", "Nacional", "Unknown"];

            typeOrder.forEach(regionType => {
                if (regionsByType[regionType]) {
                    // Create optgroup
                    const optgroup = document.createElement('optgroup');
                    optgroup.label = regionType; // Display type as group label

                    // Sort regions within the group alphabetically by id
                    regionsByType[regionType].sort((a, b) => a.id.localeCompare(b.id, 'es', { sensitivity: 'base' }));

                    // Add options to the optgroup
                    regionsByType[regionType].forEach(regionInfo => {
                        const option = document.createElement('option');
                        option.value = regionInfo.id; // Value is the sanitized ID for Firestore lookup
                        option.textContent = regionInfo.id; // Display the sanitized ID (could use originalName if stored)
                        optgroup.appendChild(option);
                    });
                    aemetRegionSelect.appendChild(optgroup); // Add the group to the select
                }
            });

            // Set default selected region if user has a location and it's in the list
            if (currentUserProfile && currentUserProfile.location) {
                const userLocationDocId = currentUserProfile.location.trim().replace('/', '_').replace('.', '');
                 if (aemetRegionSelect.querySelector(`option[value="${userLocationDocId}"]`)) {
                    // Use querySelector to check if the option actually exists before setting
                   aemetRegionSelect.value = userLocationDocId;
                   console.log(`Set AEMET region default to: ${userLocationDocId}`);
                } else {
                     console.log(`User location '${userLocationDocId}' (from profile '${currentUserProfile.location}') not found in AEMET regions for default selection.`);
                }
            }
            console.log("AEMET region dropdown populated with types.");

        } else {
            console.warn("Metadata document 'regionsWithType' not found or 'allRegionsInfo' field is missing/not an array.");
            aemetRegionSelect.innerHTML = '<option value="">No hay regiones disponibles</option>';
        }
    } catch (error) {
        console.error("Error populating AEMET region dropdown:", error);
        if (aemetRegionSelect) {
            aemetRegionSelect.innerHTML = '<option value="">Error al cargar</option>';
        }
    }
}


// --- Live Sensor Data Logic (Original Function) ---
async function obtenerDatosSensor() {
    try {
        console.log("Iniciando la obtención de datos desde Firestore (sensores)...");

        const querySnapshot = await getDocs(collection(db, "sensorData"));
        // console.log(`Número de documentos de sensor encontrados: ${querySnapshot.size}`);

        const labels = [];
        const temperaturaData = [];
        const phData = [];
        const humedadData = [];

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            let entryTimestamp;
            // Prioritize sensor_timestamp if it exists and is a Firestore Timestamp
            if (data.sensor_timestamp && typeof data.sensor_timestamp.toDate === 'function') {
                 entryTimestamp = data.sensor_timestamp.toDate().toLocaleString();
            } else if (data.timestamp && data.timestamp.seconds) { // Fallback to your original timestamp
                 entryTimestamp = new Date(data.timestamp.seconds * 1000).toLocaleString();
            } else {
                entryTimestamp = new Date().toLocaleString(); // Ultimate fallback
                console.warn("Document missing expected timestamp field, using current time:", docSnap.id, data);
            }
            labels.push(entryTimestamp);
            // Ensure data points are numbers or null/undefined
            temperaturaData.push(typeof data.temperatura === 'number' ? data.temperatura : null);
            phData.push(typeof data.ph === 'number' ? data.ph : null);
            humedadData.push(typeof data.humedad === 'number' ? data.humedad : null);
        });

        // Create/Update live sensor charts
        if (temperatureCtx) {
            if (temperatureChart) { temperatureChart.data.labels = labels; temperatureChart.data.datasets[0].data = temperaturaData; temperatureChart.update(); }
            else { temperatureChart = new Chart(temperatureCtx, { type: 'line', data: { labels: labels, datasets: [{ label: 'Temperatura (°C)', data: temperaturaData, backgroundColor: 'rgba(255, 99, 132, 0.2)', borderColor: 'rgba(255, 99, 132, 1)', borderWidth: 2, fill: false, tension: 0.4 }] }, options: { responsive: true, scales: { y: { beginAtZero: true } } } }); }
        }
        if (phCtx) {
            if (phChart) { phChart.data.labels = labels; phChart.data.datasets[0].data = phData; phChart.update(); }
            else { phChart = new Chart(phCtx, { type: 'line', data: { labels: labels, datasets: [{ label: 'pH', data: phData, backgroundColor: 'rgba(54, 235, 108, 0.2)', borderColor: 'rgb(54, 235, 78)', borderWidth: 2, fill: false, tension: 0.4 }] }, options: { responsive: true, scales: { y: { beginAtZero: true } } } }); }
        }
        if (humidityCtx) {
            if (humidityChart) { humidityChart.data.labels = labels; humidityChart.data.datasets[0].data = humedadData; humidityChart.update(); }
            else { humidityChart = new Chart(humidityCtx, { type: 'line', data: { labels: labels, datasets: [{ label: 'Humedad (%)', data: humedadData, backgroundColor: 'rgba(75, 192, 192, 0.2)', borderColor: 'rgba(75, 192, 192, 1)', borderWidth: 2, fill: false, tension: 0.4 }] }, options: { responsive: true, scales: { y: { beginAtZero: true } } } }); }
        }

        // Notifications (original logic)
        const notificationDiv = document.getElementById("notifications");
        if (notificationDiv) {
            notificationDiv.innerHTML = "";
            const lastN = Math.min(20, labels.length);
            const getAverage = arr => {
                if (!arr || arr.length === 0) return "N/A";
                const lastValues = arr.slice(Math.max(0, arr.length - lastN));
                const numericValues = lastValues.filter(v => typeof v === 'number');
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
        if (recommendationsDiv && recommendationsDiv.children.length === 0) { // Check if it's empty
            const p = document.createElement("p");
            p.textContent = "Revisar la humedad si la temperatura sigue aumentando."; // Default recommendation
            recommendationsDiv.appendChild(p);
        }

    } catch (error) {
        console.error("Error obteniendo documentos de sensor:", error);
    }
}


// --- AEMET Historical Data Viewing Logic ---
async function fetchAndDisplayAemetDataFromButton() {
    const region = aemetRegionSelect ? aemetRegionSelect.value : '';
    const parameterCode = aemetParameterSelect ? aemetParameterSelect.value : '';
    const year = aemetYearSelect ? aemetYearSelect.value : '';

    if (!aemetStatusMessage || !aemetChartCanvas) {
        console.error("AEMET display elements not found.");
        return;
    }

    if (!region) {
        aemetStatusMessage.textContent = "Por favor, seleccione una región.";
        aemetStatusMessage.style.color = "red";
        aemetChartCanvas.style.display = 'none';
        if (aemetChartInstance) { aemetChartInstance.destroy(); aemetChartInstance = null; }
        return;
    }
     if (!parameterCode) {
        aemetStatusMessage.textContent = "Por favor, seleccione un parámetro.";
        aemetStatusMessage.style.color = "red";
        aemetChartCanvas.style.display = 'none';
        if (aemetChartInstance) { aemetChartInstance.destroy(); aemetChartInstance = null; }
        return;
    }
     if (!year) {
        aemetStatusMessage.textContent = "Por favor, seleccione un año.";
        aemetStatusMessage.style.color = "red";
        aemetChartCanvas.style.display = 'none';
        if (aemetChartInstance) { aemetChartInstance.destroy(); aemetChartInstance = null; }
        return;
    }


    aemetStatusMessage.textContent = "Cargando datos AEMET...";
    aemetStatusMessage.style.color = "orange";
    aemetChartCanvas.style.display = 'none';
    if (aemetChartInstance) { aemetChartInstance.destroy(); aemetChartInstance = null; }

    const selectedRegionDocId = region; // Value from select is the sanitized doc ID

    try {
        // Construct the path using the selected region ID, parameter code (which includes type), and year
        const aemetDocPath = `aemetHistoricalData/${selectedRegionDocId}/${parameterCode}/${year}`;
        console.log("Attempting to fetch AEMET data from path:", aemetDocPath); // Log the path
        const aemetDocRef = doc(db, aemetDocPath);
        const docSnap = await getDoc(aemetDocRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data && data.monthlyValues) { // Check if monthlyValues exists
                const displayName = data.regionOriginal || selectedRegionDocId;
                const displayParam = data.parameterCodeUsed || parameterCode;
                aemetStatusMessage.textContent = `Mostrando: ${displayName} - ${displayParam} - ${data.year}`;
                aemetStatusMessage.style.color = "green";
                displayAemetDataAsChart(data.monthlyValues, `${displayParam} (${data.year})`);
                aemetChartCanvas.style.display = 'block';
            } else {
                 console.error("Document exists but missing 'monthlyValues' field:", data);
                 aemetStatusMessage.textContent = `Datos incompletos para: ${selectedRegionDocId}, ${parameterCode}, ${year}.`;
                 aemetStatusMessage.style.color = "red";
            }
        } else {
            aemetStatusMessage.textContent = `No se encontraron datos para: ${selectedRegionDocId}, ${parameterCode}, ${year}. Verifique selección.`;
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
            currentUserProfile = null; // Clear profile on logout
            window.location.href = "auth.html";
        } catch (error) {
            alert("Error al cerrar sesión: " + error.message);
        }
    });
}