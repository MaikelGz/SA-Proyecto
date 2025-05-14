// js/historicalPage.js
import { db, auth } from '../firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

// --- Global Variables for this page ---
let selectedRegionIdHistorical = null;
let selectedRegionDisplayNameHistorical = null;
let aemetHistoricalChartInstance = null; // Chart instance for this page

// --- DOM Elements for historical-data.html ---
const historicalTitleSpan = document.getElementById('selected-region-name-historical');
const backToDashboardLink = document.getElementById('back-to-dashboard-link');
const logoutBtnHistorical = document.getElementById('logout-btn'); // Ensure unique ID or use a class

const historicalAemetParameterSelect = document.getElementById('aemet-parameter-select');
const historicalAemetYearSelect = document.getElementById('aemet-year-select');
const fetchHistoricalAemetBtn = document.getElementById('fetch-historical-aemet-btn');
const historicalAemetChartCanvas = document.getElementById('aemetChart'); // Canvas on this page
const historicalAemetStatusMessage = document.getElementById('aemet-status-message');

// --- Initialization on Page Load ---
document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = "auth.html";
        } else {
            const urlParams = new URLSearchParams(window.location.search);
            selectedRegionIdHistorical = urlParams.get('region');

            if (!selectedRegionIdHistorical) {
                alert("No se ha especificado una región para el histórico. Redirigiendo...");
                window.location.href = "index.html";
                return;
            }
            
            await fetchRegionDisplayNameHistorical();
            updateHistoricalPageTitles();

            // Set up "Back to Dashboard" link
            if (backToDashboardLink) {
                backToDashboardLink.href = `region-dashboard.html?region=${encodeURIComponent(selectedRegionIdHistorical)}`;
            }
        }
    });
});


async function fetchRegionDisplayNameHistorical() {
    let displayName = selectedRegionIdHistorical.replace(/_/g, ' '); 
    if (!selectedRegionIdHistorical) return;
    try {
        const stationMapDocRef = doc(db, "aemetProvinceStationMap", selectedRegionIdHistorical);
        const stationSnap = await getDoc(stationMapDocRef);
        if (stationSnap.exists() && stationSnap.data().provincia) {
            displayName = stationSnap.data().provincia; 
        } else {
            const metaDocRef = doc(db, "metadata", "regionsWithType");
            const metaSnap = await getDoc(metaDocRef);
            if (metaSnap.exists()) {
                const regionsInfo = metaSnap.data().allRegionsInfo;
                const regionInfo = regionsInfo?.find(r => r.id === selectedRegionIdHistorical);
                if (regionInfo && regionInfo.id) { 
                    displayName = regionInfo.id.replace(/_/g, ' ');
                }
            }
        }
    } catch (error) {
        console.warn("Could not fetch a specific display name for historical region:", error);
    }
    selectedRegionDisplayNameHistorical = displayName;
}


function updateHistoricalPageTitles() {
    const display = selectedRegionDisplayNameHistorical || selectedRegionIdHistorical.replace(/_/g, ' ');
    if (historicalTitleSpan) historicalTitleSpan.textContent = display;
    document.title = `Histórico: ${display} - Monitor Suelo`;
}

// --- Historical AEMET Data Logic (Moved here) ---
if (fetchHistoricalAemetBtn) {
    fetchHistoricalAemetBtn.addEventListener('click', async () => {
        if (!historicalAemetParameterSelect || !historicalAemetYearSelect || !historicalAemetStatusMessage || !historicalAemetChartCanvas) {
             console.error("Historical AEMET DOM elements missing.");
             return;
        }
        
        const parameterCode = historicalAemetParameterSelect.value;
        const year = historicalAemetYearSelect.value;

        if (!selectedRegionIdHistorical || !parameterCode || !year) {
            historicalAemetStatusMessage.textContent = "Seleccione región (implícita), parámetro y año.";
            historicalAemetStatusMessage.style.color = "red";
            return;
        }
        historicalAemetStatusMessage.textContent = "Cargando datos históricos AEMET...";
        historicalAemetStatusMessage.style.color = "orange";
        historicalAemetChartCanvas.style.display = 'none';
        if (aemetHistoricalChartInstance) { aemetHistoricalChartInstance.destroy(); aemetHistoricalChartInstance = null;}

        try {
            const aemetDocPath = `aemetHistoricalData/${selectedRegionIdHistorical}/${parameterCode}/${year}`;
            console.log("Fetching historical AEMET from:", aemetDocPath);
            const aemetDocRef = doc(db, aemetDocPath);
            const docSnap = await getDoc(aemetDocRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data?.monthlyValues) {
                    const displayName = data.regionOriginal || selectedRegionDisplayNameHistorical;
                    const displayParam = data.parameterCodeUsed || parameterCode;
                    historicalAemetStatusMessage.textContent = `Mostrando: ${displayName} - ${displayParam} - ${data.year}`;
                    historicalAemetStatusMessage.style.color = "green";
                    displayHistoricalAemetChartOnPage(data.monthlyValues, `${displayParam} (${data.year})`);
                    historicalAemetChartCanvas.style.display = 'block';
                } else {
                    console.error("Historical document exists but missing 'monthlyValues':", data);
                    historicalAemetStatusMessage.textContent = `Datos históricos incompletos para ${selectedRegionDisplayNameHistorical}.`;
                    historicalAemetStatusMessage.style.color = "red";
                }
            } else {
                historicalAemetStatusMessage.textContent = `No se encontraron datos históricos para ${selectedRegionDisplayNameHistorical}, ${parameterCode}, ${year}.`;
                historicalAemetStatusMessage.style.color = "red";
            }
        } catch (error) {
            console.error("Error fetching historical AEMET:", error);
            historicalAemetStatusMessage.textContent = "Error al cargar datos históricos.";
            historicalAemetStatusMessage.style.color = "red";
        }
    });
}

function displayHistoricalAemetChartOnPage(monthlyValues, chartLabel) {
    if (!historicalAemetChartCanvas) return;
    const monthOrder = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const labels = [], dataPoints = [];
    monthOrder.forEach(m => { labels.push(m.charAt(0).toUpperCase() + m.slice(1)); dataPoints.push(monthlyValues?.[m] ?? null); });
    
    const ctx = historicalAemetChartCanvas.getContext('2d');
    if (aemetHistoricalChartInstance) aemetHistoricalChartInstance.destroy();
    aemetHistoricalChartInstance = new Chart(ctx, { 
        type: 'bar', 
        data: { 
            labels, 
            datasets: [{ 
                label: chartLabel, 
                data: dataPoints, 
                backgroundColor: 'rgba(0, 123, 255, 0.6)',
                borderColor: 'rgba(0, 123, 255, 1)',
                borderWidth: 1
            }] 
        }, 
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            scales: {y:{beginAtZero:true, title: {display: true, text: 'Valor'}}, x:{title: {display: true, text: 'Mes'}}},
            plugins: { tooltip: { callbacks: { label: function(context) { let label = context.dataset.label || ''; if (label) { label += ': '; } if (context.parsed.y !== null) { label += context.parsed.y; } else { label += 'N/A';} return label; } } } }
        } 
    });
}

// --- Logout Functionality ---
if (logoutBtnHistorical) { // Use the ID from historical-data.html
    logoutBtnHistorical.addEventListener("click", async () => {
        try {
            await signOut(auth);
            if (aemetHistoricalChartInstance) { aemetHistoricalChartInstance.destroy(); aemetHistoricalChartInstance = null; }
            window.location.href = "auth.html";
        } catch (error) {
            alert("Error al cerrar sesión: " + error.message);
        }
    });
}