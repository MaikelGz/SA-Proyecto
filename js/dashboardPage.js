// js/dashboardPage.js
import { db, auth } from '../firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getDocs, collection, doc, getDoc, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

// --- Global Variables for this page ---
let currentUserProfile = null;
let selectedRegionId = null; // The sanitized region ID from URL (e.g., A_CORUÑA)
let selectedRegionDisplayName = null; // For display (e.g., A CORUÑA)

// --- DOM Elements for region-dashboard.html ---
const dashboardTitleSpan = document.getElementById('selected-region-name');
const dynamicRegionNameSpans = document.querySelectorAll('.dynamic-region-name');
const logoutBtn = document.getElementById('logout-btn');

// Sensor Summary Elements
const summaryTempSpan = document.getElementById('summary-temp');
const summaryPhSpan = document.getElementById('summary-ph');
const summaryHumiditySpan = document.getElementById('summary-humidity');
const simulateNewReadingBtn = document.getElementById('simulate-new-reading-btn');

// Recommendations Element
const recommendationsDiv = document.getElementById('recommendations');

// Real-time AEMET (Simulated) Elements
const rtStationNameSpan = document.getElementById('rt-station-name');
const rtTimestampSpan = document.getElementById('rt-timestamp');
const rtTempSpan = document.getElementById('rt-temp');
const rtHumiditySpan = document.getElementById('rt-humidity');
const rtPrecipSpan = document.getElementById('rt-precip');
const realtimeAemetStatusMessage = document.getElementById('realtime-aemet-status-message');
const realtimeDataValuesDiv = document.getElementById('realtime-data-values');

// Historical Data Link Button
const viewHistoricalDataBtn = document.getElementById('view-historical-data-btn');

// --- Initialization on Page Load ---
document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = "auth.html";
        } else {
            currentUserProfile = await fetchUserProfile(user.uid);
            
            const urlParams = new URLSearchParams(window.location.search);
            selectedRegionId = urlParams.get('region');

            if (!selectedRegionId) {
                alert("No se ha especificado una región. Redirigiendo...");
                window.location.href = "index.html";
                return;
            }
            
            await fetchRegionDisplayName();
            updatePageTitlesAndElements();
            initializeDashboardData();
        }
    });
});

async function fetchUserProfile(userId) {
    if (!userId) return null;
    try {
        const userDocRef = doc(db, "usuarios", userId);
        const docSnap = await getDoc(userDocRef);
        if (docSnap.exists()) return docSnap.data();
    } catch (error) { console.error("Error fetching user profile:", error); }
    return null;
}

async function fetchRegionDisplayName() {
    let displayName = selectedRegionId.replace(/_/g, ' '); 
    if (!selectedRegionId) return;

    try {
        const stationMapDocRef = doc(db, "aemetProvinceStationMap", selectedRegionId);
        const stationSnap = await getDoc(stationMapDocRef);
        if (stationSnap.exists() && stationSnap.data().provincia) {
            displayName = stationSnap.data().provincia; 
        } else {
            // Fallback if not in aemetProvinceStationMap, try metadata (if it stores display names)
            const metaDocRef = doc(db, "metadata", "regionsWithType");
            const metaSnap = await getDoc(metaDocRef);
            if (metaSnap.exists()) {
                const regionsInfo = metaSnap.data().allRegionsInfo;
                const regionInfo = regionsInfo?.find(r => r.id === selectedRegionId);
                if (regionInfo && regionInfo.id) { // Assuming .id is the displayable name here if no other source
                    displayName = regionInfo.id.replace(/_/g, ' '); // Use the ID from metadata if found
                }
            }
        }
    } catch (error) {
        console.warn("Could not fetch a specific display name for region, using transformed ID:", error);
    }
    selectedRegionDisplayName = displayName;
}

function updatePageTitlesAndElements() {
    const display = selectedRegionDisplayName || selectedRegionId.replace(/_/g, ' ');
    if (dashboardTitleSpan) dashboardTitleSpan.textContent = display;
    if (dynamicRegionNameSpans) {
        dynamicRegionNameSpans.forEach(span => span.textContent = display);
    }
    document.title = `Dashboard: ${display} - Monitor Suelo`;
}

async function initializeDashboardData() {
    console.log(`Initializing dashboard for region: ${selectedRegionId} (Display: ${selectedRegionDisplayName})`);
    await fetchAndDisplaySensorData();
    await fetchAndDisplayRealtimeAemetSimulated();
}

// --- Live Sensor Data & Recommendations Logic ---
async function fetchAndDisplaySensorData(isManualSimulation = false, simulatedData = null) {
    let latestSensorData = null;

    if (isManualSimulation && simulatedData) {
        console.log("Using manually simulated sensor data:", simulatedData);
        latestSensorData = simulatedData;
    } else {
        try {
            // Fetch the latest sensor data entry globally for now
            // In a real app, you might filter sensorData by region if applicable
            const sensorQuery = query(collection(db, "sensorData"), orderBy("sensor_timestamp", "desc"), limit(1));
            const sensorSnapshot = await getDocs(sensorQuery);
            if (!sensorSnapshot.empty) {
                latestSensorData = sensorSnapshot.docs[0].data();
            } else {
                console.log("No sensor data found in Firestore.");
            }
        } catch (error) {
            console.error("Error fetching sensor data:", error);
            generateEnhancedRecommendations(null, null, "Error al cargar datos del sensor.");
            updateSensorSummary(null); // Clear summary
            return;
        }
    }
    
    updateSensorSummary(latestSensorData);

    let aemetHistoricalContext = null;
    if (selectedRegionId && latestSensorData) {
        const currentMonthIndex = new Date().getMonth();
        const monthNames = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
        const currentMonthName = monthNames[currentMonthIndex];
        let aemetParamCode = "AD25mm_Provincias"; // Default
        const refYear = "2020"; 

        try {
            const aemetDocRef = doc(db, `aemetHistoricalData/${selectedRegionId}/${aemetParamCode}/${refYear}`);
            const aemetDocSnap = await getDoc(aemetDocRef);
            if (aemetDocSnap.exists()) {
                const data = aemetDocSnap.data();
                if (data.monthlyValues?.[currentMonthName] !== undefined) {
                    aemetHistoricalContext = {
                        value: data.monthlyValues[currentMonthName],
                        month: currentMonthName,
                        year: refYear,
                        parameter: aemetParamCode,
                        region: data.regionOriginal || selectedRegionDisplayName
                    };
                }
            }
        } catch (error) { console.error("Error fetching AEMET context for recs:", error); }
    }
    
    generateEnhancedRecommendations(latestSensorData, aemetHistoricalContext);
}

function updateSensorSummary(sensorData) {
    if (sensorData) {
        if (summaryTempSpan) summaryTempSpan.textContent = sensorData.temperatura?.toFixed(1) ?? 'N/A';
        if (summaryPhSpan) summaryPhSpan.textContent = sensorData.ph?.toFixed(1) ?? 'N/A';
        if (summaryHumiditySpan) summaryHumiditySpan.textContent = sensorData.humedad?.toFixed(1) ?? 'N/A';
    } else {
        if (summaryTempSpan) summaryTempSpan.textContent = 'N/A';
        if (summaryPhSpan) summaryPhSpan.textContent = 'N/A';
        if (summaryHumiditySpan) summaryHumiditySpan.textContent = 'N/A';
    }
}

function generateEnhancedRecommendations(latestSensor, historicalContext, errorMessage = null) {
    if (!recommendationsDiv) return;
    recommendationsDiv.innerHTML = ""; 
    if (errorMessage) { recommendationsDiv.innerHTML = `<p style="color:red;">${errorMessage}</p>`; return; }
    if (!latestSensor) { recommendationsDiv.innerHTML = "<p>No hay datos de sensor para generar recomendaciones.</p>"; return; }
    
    let recommendations = [];
    let issuesFound = false;

    // Rule 1: pH Check
    if (latestSensor.ph !== undefined) {
        if (latestSensor.ph < 5.5) {
            recommendations.push(`ALERTA pH: El pH (${latestSensor.ph.toFixed(1)}) es muy bajo (ácido). Considere aplicar cal.`);
            issuesFound = true;
        } else if (latestSensor.ph > 7.8) {
            recommendations.push(`ALERTA pH: El pH (${latestSensor.ph.toFixed(1)}) es muy alto (alcalino). Considere aplicar azufre.`);
            issuesFound = true;
        } else {
            recommendations.push(`INFO pH: El pH del suelo (${latestSensor.ph.toFixed(1)}) está en rango aceptable.`);
        }
    }

    // Rule 2: Humidity Check
    if (latestSensor.humedad !== undefined) {
        const currentHumidity = latestSensor.humedad;
        let humidityRec = `INFO Humedad: Actual ${currentHumidity.toFixed(1)}%. `;
        if (currentHumidity < 25) {
            humidityRec += `Nivel MUY BAJO. ¡RIEGO URGENTE!`;
            issuesFound = true;
        } else if (currentHumidity < 40) {
            humidityRec += `Nivel bajo. Considerar riego.`;
        } else if (currentHumidity > 85) {
            humidityRec += `Nivel MUY ALTO. ¡Verificar drenaje!`;
            issuesFound = true;
        }
        if (historicalContext?.value !== undefined) {
            humidityRec += ` (Promedio hist. ${historicalContext.month} en ${historicalContext.region.split('(')[0].trim()}: ${historicalContext.value.toFixed(1)}%).`;
            if (currentHumidity < historicalContext.value * 0.6) {
                humidityRec += ` ¡Mucho más seco que el promedio!`;
                issuesFound = true;
            } else if (currentHumidity > historicalContext.value * 1.4) {
                 humidityRec += ` ¡Mucho más húmedo que el promedio!`;
                 issuesFound = true;
            }
        }
        recommendations.push(humidityRec);
    }

    // Rule 3: Temperature Check
    if (latestSensor.temperatura !== undefined) {
        if (latestSensor.temperatura > 38) {
            recommendations.push(`ALERTA Temp: (${latestSensor.temperatura.toFixed(1)}°C) muy alta. Asegure humedad y considere sombreo.`);
            issuesFound = true;
        } else if (latestSensor.temperatura < 5) {
            recommendations.push(`AVISO Temp: (${latestSensor.temperatura.toFixed(1)}°C) muy baja. Proteger de heladas.`);
        } else {
             recommendations.push(`INFO Temp: (${latestSensor.temperatura.toFixed(1)}°C) en rango normal.`);
        }
    }

    if (!issuesFound && recommendations.every(rec => rec.startsWith("INFO"))) {
        recommendationsDiv.innerHTML = "<p>Condiciones generales del suelo parecen estar bien. Continuar monitorizando.</p>";
    } else if (recommendations.length === 0) {
        recommendationsDiv.innerHTML = "<p>No hay recomendaciones específicas basadas en los datos actuales.</p>";
    } else {
        recommendations.forEach(recText => {
            const p = document.createElement("p");
            if (recText.startsWith("ALERTA")) { p.style.color = "red"; p.style.fontWeight = "bold"; }
            else if (recText.startsWith("AVISO")) { p.style.color = "orange"; }
            else if (recText.startsWith("INFO")) { p.style.color = "green"; }
            p.textContent = recText;
            recommendationsDiv.appendChild(p);
        });
    }
}

if (simulateNewReadingBtn) {
    simulateNewReadingBtn.addEventListener('click', () => {
        console.log("Simulate new reading button clicked.");
        const fakeNewSensorData = {
            temperatura: parseFloat((Math.random() * 25 + 10).toFixed(1)),
            ph: parseFloat((Math.random() * 2 + 5.5).toFixed(1)),
            humedad: parseFloat((Math.random() * 50 + 30).toFixed(1)),
            sensor_timestamp: { toDate: () => new Date(), seconds: Math.floor(Date.now() / 1000) }
        };
        // Instead of just passing fake data, we should add it to Firestore
        // and then re-fetch to mimic the real flow. For now, direct pass:
        // updateSensorSummary(fakeNewSensorData); // Update summary immediately
        // generateEnhancedRecommendations(fakeNewSensorData, <pass_historical_context_again_or_store_it>);
        // For a more 'real' simulation effect that uses the fetch logic:
        fetchAndDisplaySensorData(true, fakeNewSensorData); // Pass true and the data
    });
}

// --- Real-time AEMET Data (Simulated, for this selected region) ---
async function fetchAndDisplayRealtimeAemetSimulated() {
    // Ensure all necessary DOM elements for this section are defined globally and available
    if (!realtimeDataValuesDiv || !rtStationNameSpan || !rtTimestampSpan || 
        !rtTempSpan || !rtHumiditySpan || !rtPrecipSpan || !realtimeAemetStatusMessage) {
        console.error("CRITICAL: One or more Real-time AEMET display span/div elements are missing from the DOM or not selected correctly in JS.");
        if(realtimeAemetStatusMessage) { // At least try to show an error
            realtimeAemetStatusMessage.textContent = "Error de configuración de página.";
            realtimeAemetStatusMessage.style.color = "red";
        }
        return; 
    }
    
    console.log("Attempting to fetch and display real-time AEMET (simulated)...");
    realtimeDataValuesDiv.style.display = 'none'; // Hide initially
    realtimeAemetStatusMessage.textContent = "Cargando IDEMA para la región...";
    realtimeAemetStatusMessage.style.color = "orange";

    let idemaForRegion = null;
    if (selectedRegionId) { // selectedRegionId is set from URL param when page loads
        try {
            const stationMapDocRef = doc(db, "aemetProvinceStationMap", selectedRegionId);
            // console.log("Fetching IDEMA from Firestore path:", stationMapDocRef.path); 
            const docSnap = await getDoc(stationMapDocRef);
            if (docSnap.exists()) {
                idemaForRegion = docSnap.data().idema;
                console.log(`IDEMA found for ${selectedRegionId}: ${idemaForRegion}`);
                // Update display name if it's more accurate from this source
                const provinceDisplayNameFromMap = docSnap.data().provincia;
                 if (provinceDisplayNameFromMap && provinceDisplayNameFromMap !== selectedRegionDisplayName) {
                    selectedRegionDisplayName = provinceDisplayNameFromMap; // Update global for consistency
                    updatePageTitlesAndElements(); // Refresh titles if name changed
                }
            } else {
                console.warn(`No station mapping found for region ${selectedRegionId} in aemetProvinceStationMap.`);
                realtimeAemetStatusMessage.textContent = `No hay estación AEMET configurada para ${selectedRegionDisplayName || selectedRegionId}.`;
                realtimeAemetStatusMessage.style.color = "red";
                return;
            }
        } catch (error) {
            console.error("Error fetching IDEMA for region:", error);
            realtimeAemetStatusMessage.textContent = "Error obteniendo configuración de estación.";
            realtimeAemetStatusMessage.style.color = "red";
            return;
        }
    } else {
        console.warn("selectedRegionId is not set for real-time AEMET.");
        realtimeAemetStatusMessage.textContent = "Región no especificada para observación actual.";
        realtimeAemetStatusMessage.style.color = "red";
        return; 
    }

    if (!idemaForRegion) {
        console.warn(`No IDEMA found for ${selectedRegionDisplayName || selectedRegionId}.`);
        realtimeAemetStatusMessage.textContent = `No se encontró IDEMA para ${selectedRegionDisplayName || selectedRegionId}.`;
        realtimeAemetStatusMessage.style.color = "red";
        return;
    }

    realtimeAemetStatusMessage.textContent = `Cargando observación (simulada) para ${selectedRegionDisplayName} (IDEMA: ${idemaForRegion})...`;
    // color is already orange

    const response = await SIMULATED_getAemetRealtimeObservation(idemaForRegion);

    if (response?.status === 200 && response.data?.length > 0) {
        const latestObservation = response.data[response.data.length - 1]; // Get the last (assumed latest) entry
        console.log("Simulated AEMET observation data:", latestObservation); 

        realtimeAemetStatusMessage.textContent = `Observación (simulada) para ${latestObservation.ubi || selectedRegionDisplayName}`;
        realtimeAemetStatusMessage.style.color = "green";

        rtStationNameSpan.textContent = latestObservation.ubi || "N/A";
        rtTimestampSpan.textContent = latestObservation.fint ? new Date(latestObservation.fint).toLocaleString() : "N/A";
        rtTempSpan.textContent = latestObservation.ta?.toFixed(1) ?? "N/A";
        rtHumiditySpan.textContent = latestObservation.hr?.toFixed(0) ?? "N/A";
        rtPrecipSpan.textContent = latestObservation.prec?.toFixed(1) ?? "N/A";
        
        realtimeDataValuesDiv.style.display = 'block'; // Show data
    } else {
        console.warn("Failed to get simulated AEMET data or data was empty. Response:", response);
        realtimeAemetStatusMessage.textContent = `Error o no hay datos (simulados) para IDEMA ${idemaForRegion}. ${response?.description || ''}`;
        realtimeAemetStatusMessage.style.color = "red";
        realtimeDataValuesDiv.style.display = 'none'; // Keep hidden
    }
}

// --- Real-time AEMET Observation Logic (Using Simulation) ---
// This is your proven simulation logic, slightly adapted for the new structure
async function SIMULATED_getAemetRealtimeObservation(idema) {
    console.log(`SIMULATING AEMET API call for IDEMA: ${idema}`);
    await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network delay

    const exampleStationData = {
        "2517A": [ // FUENTE EL SOL from your example
            { "idema": "2517A", "fint": "2025-05-13T09:00:00+0000", "prec": 0.0, "ubi": "FUENTE EL SOL (Ejemplo)", "hr": 53.0, "ta": 14.5 },
            { "idema": "2517A", "fint": "2025-05-13T10:00:00+0000", "prec": 0.0, "ubi": "FUENTE EL SOL (Ejemplo)", "hr": 48.0, "ta": 15.4 }
        ],
        "8175": [ // MADRID, RETIRO example
            { "idema": "8175", "fint": new Date(Date.now() - 2 * 3600000).toISOString(), "prec": 0.1, "ubi": "MADRID, RETIRO (Sim.)", "hr": 65.0, "ta": 18.2 },
            { "idema": "8175", "fint": new Date(Date.now() - 1 * 3600000).toISOString(), "prec": 0.0, "ubi": "MADRID, RETIRO (Sim.)", "hr": 60.0, "ta": 19.5 }
        ]
        // Add IDEMAs that are present in your aemetProvinceStationMap for testing
    };
    
    if (exampleStationData[idema]) {
        console.log(`Simulation: Found specific data for IDEMA ${idema}`);
        return { status: 200, data: exampleStationData[idema], description: "Éxito (simulado específico)" };
    } else if (idema === "9999X_FAIL") { 
        console.log(`Simulation: Simulating failure for IDEMA ${idema}`);
        return { status: 404, data: null, description: "Estación no encontrada (simulado)" };
    } else { 
        console.log(`Simulation: Generating generic data for IDEMA ${idema}`);
        const now = new Date();
        const randomTemp = (Math.random() * 20 + 5).toFixed(1); 
        const randomHr = Math.floor(Math.random() * 60 + 30);   
        const randomPrec = Math.random() < 0.15 ? (Math.random() * 3).toFixed(1) : 0.0; 
        return {
            status: 200,
            data: [{
                "idema": idema,
                "fint": now.toISOString(),
                "prec": parseFloat(randomPrec),
                "ubi": `Estación Simulada ${idema ? idema.substring(0,4) : 'N/A'}`, 
                "hr": parseFloat(randomHr),
                "ta": parseFloat(randomTemp)
            }],
            description: "Éxito (simulado genérico)"
        };
    }
}

// --- Navigation to Historical Data Page ---
if (viewHistoricalDataBtn) {
    viewHistoricalDataBtn.addEventListener('click', () => {
        if (selectedRegionId) {
            window.location.href = `historical-data.html?region=${encodeURIComponent(selectedRegionId)}`;
        } else {
            alert("No se ha seleccionado una región para ver el histórico.");
        }
    });
}

// --- Logout Functionality ---
if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
        try {
            await signOut(auth);
            // No charts to destroy on this simplified page, but good practice if you add any
            window.location.href = "auth.html";
        } catch (error) {
            alert("Error al cerrar sesión: " + error.message);
        }
    });
}