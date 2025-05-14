import { db, auth } from '../firebase-config.js'; // Adjusted path if mainPage.js is in a 'js' subfolder
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

// DOM Elements for index.html (Region Selector Page)
const userRegisteredLocationInput = document.getElementById('user-registered-location');
const monitoringRegionSelect = document.getElementById('monitoring-region-select');
const viewRegionDashboardBtn = document.getElementById('view-region-dashboard-btn');
const selectionStatusParagraph = document.getElementById('selection-status');
const logoutBtn = document.getElementById('logout-btn');
const mainTitle = document.getElementById('main-title'); // If you want to update title

let currentUserProfile = null;

// --- Authentication Check ---
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "auth.html"; // Redirect to login if not authenticated
    } else {
        console.log("User authenticated for main page:", user.uid);
        currentUserProfile = await fetchUserProfile(user.uid);
        if (currentUserProfile && currentUserProfile.location && mainTitle) {
            mainTitle.textContent = `Monitorización de Salud del Suelo - Bienvenido ${currentUserProfile.username || ''}`;
        }
        displayUserRegisteredLocation();
        await populateMonitoringRegionDropdown();
    }
});

// --- Fetch User Profile ---
async function fetchUserProfile(userId) {
    if (!userId) return null;
    try {
        const userDocRef = doc(db, "usuarios", userId);
        const docSnap = await getDoc(userDocRef);
        if (docSnap.exists()) {
            console.log("User profile for main page fetched:", docSnap.data());
            return docSnap.data();
        } else {
            console.log("No user profile found for UID:", userId);
            return null; // Or handle as an error, e.g., redirect to auth
        }
    } catch (error) {
        console.error("Error fetching user profile:", error);
        return null;
    }
}

// --- Display User's Registered Location ---
function displayUserRegisteredLocation() {
    if (userRegisteredLocationInput && currentUserProfile && currentUserProfile.location) {
        userRegisteredLocationInput.value = currentUserProfile.location;
    } else if (userRegisteredLocationInput) {
        userRegisteredLocationInput.value = "No registrada";
    }
}

// --- Populate Monitoring Region Dropdown ---
async function populateMonitoringRegionDropdown() {
    if (!monitoringRegionSelect) {
        console.error("Monitoring Region Select element not found.");
        return;
    }
    console.log("Populating monitoring region dropdown from metadata/regionsWithType...");
    monitoringRegionSelect.innerHTML = '<option value="">-- Cargando regiones... --</option>'; // Initial loading message

    try {
        const regionsMetaDocRef = doc(db, "metadata", "regionsWithType");
        const docSnap = await getDoc(regionsMetaDocRef);

        if (docSnap.exists() && docSnap.data().allRegionsInfo && Array.isArray(docSnap.data().allRegionsInfo)) {
            const regionsInfoArray = docSnap.data().allRegionsInfo;
            monitoringRegionSelect.innerHTML = '<option value="">-- Seleccione una Región --</option>'; // Reset after loading

            const regionsByType = {};
            regionsInfoArray.forEach(regionInfo => {
                if (typeof regionInfo === 'object' && regionInfo !== null && regionInfo.id && regionInfo.type) {
                    if (!regionsByType[regionInfo.type]) {
                        regionsByType[regionInfo.type] = [];
                    }
                    regionsByType[regionInfo.type].push(regionInfo);
                }
            });

            const typeOrder = ["Provincia", "ComunidadesAutonomas", "GrandesCuencas", "Nacional", "Unknown"];
            typeOrder.forEach(regionType => {
                if (regionsByType[regionType]) {
                    const optgroup = document.createElement('optgroup');
                    optgroup.label = regionType;
                    regionsByType[regionType].sort((a, b) => a.id.localeCompare(b.id, 'es', { sensitivity: 'base' }));
                    regionsByType[regionType].forEach(regionInfo => {
                        const option = document.createElement('option');
                        option.value = regionInfo.id; // Value is the sanitized ID for Firestore lookup
                        option.textContent = regionInfo.id; // Display the sanitized ID (or originalName if you store it)
                        optgroup.appendChild(option);
                    });
                    monitoringRegionSelect.appendChild(optgroup);
                }
            });

            // Attempt to pre-select based on user's registered location
            if (currentUserProfile && currentUserProfile.location) {
                const userLocationDocId = currentUserProfile.location.trim().toUpperCase().replace('/', '_').replace('.', '');
                if (monitoringRegionSelect.querySelector(`option[value="${userLocationDocId}"]`)) {
                    monitoringRegionSelect.value = userLocationDocId;
                    viewRegionDashboardBtn.disabled = false; // Enable button if default is selected
                    if (selectionStatusParagraph) selectionStatusParagraph.textContent = `Región seleccionada: ${userLocationDocId}`;
                }
            }
             console.log("Monitoring region dropdown populated.");
        } else {
            console.warn("Metadata document 'regionsWithType' not found or 'allRegionsInfo' field is missing/not an array.");
            monitoringRegionSelect.innerHTML = '<option value="">No hay regiones disponibles</option>';
            if (selectionStatusParagraph) selectionStatusParagraph.textContent = "No se pudieron cargar las regiones.";
        }
    } catch (error) {
        console.error("Error populating monitoring region dropdown:", error);
        if (monitoringRegionSelect) monitoringRegionSelect.innerHTML = '<option value="">Error al cargar regiones</option>';
        if (selectionStatusParagraph) selectionStatusParagraph.textContent = "Error al cargar regiones.";
    }
}

// --- Event Listener for Region Selection Change ---
if (monitoringRegionSelect && viewRegionDashboardBtn) {
    monitoringRegionSelect.addEventListener('change', () => {
        if (monitoringRegionSelect.value) {
            viewRegionDashboardBtn.disabled = false;
            if (selectionStatusParagraph) selectionStatusParagraph.textContent = `Región seleccionada: ${monitoringRegionSelect.value}`;
        } else {
            viewRegionDashboardBtn.disabled = true;
            if (selectionStatusParagraph) selectionStatusParagraph.textContent = "";
        }
    });
}

// --- Event Listener for "View Dashboard" Button ---
if (viewRegionDashboardBtn && monitoringRegionSelect) {
    viewRegionDashboardBtn.addEventListener('click', () => {
        const selectedRegion = monitoringRegionSelect.value;
        if (selectedRegion) {
            // Navigate to dashboard page, passing region as a URL parameter
            window.location.href = `region-dashboard.html?region=${encodeURIComponent(selectedRegion)}`;
        } else {
            if (selectionStatusParagraph) selectionStatusParagraph.textContent = "Por favor, seleccione una región primero.";
            alert("Por favor, seleccione una región primero.");
        }
    });
}

// --- Logout Functionality ---
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        try {
            await signOut(auth);
            console.log("User signed out");
            window.location.href = "auth.html"; // Redirect to login page
        } catch (error) {
            console.error("Error signing out:", error);
            alert("Error al cerrar sesión: " + error.message);
        }
    });
}