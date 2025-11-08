// js/camion.js
const API_BASE = "http://localhost:4000";
const TRUCK_KEY = "truckroute_truckConfig";

function loadTruckPreview() {
  const previewEl = document.getElementById("preview");
  const raw = localStorage.getItem(TRUCK_KEY);
  previewEl.textContent = raw ? raw : "No hay configuración guardada.";
}

document.addEventListener("DOMContentLoaded", () => {
  const stored = localStorage.getItem("truckroute_truckConfig");
  if (stored) {
    const config = JSON.parse(stored);
    const select = document.getElementById("tipoCamion");

    // Si el valor existe en las opciones, se selecciona
    if (select && config.tipo) {
      const optionExists = Array.from(select.options).some(opt => opt.value === config.tipo);
      if (optionExists) {
        select.value = config.tipo;
      } else {
        // Si no existe, lo añade como opción visible
        const opt = document.createElement("option");
        opt.value = config.tipo;
        opt.textContent = config.tipo + " (guardado)";
        select.appendChild(opt);
        select.value = config.tipo;
      }
    }

    // Rellenar otros campos
    document.getElementById("peso").value = config.pesoKg || "";
    document.getElementById("alto").value = config.alto || "";
    document.getElementById("ancho").value = config.ancho || "";
  }



  
});


  loadTruckPreview();

  document.getElementById("camionForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const tipo = document.getElementById("tipoCamion").value;
    const pesoKg = Number(document.getElementById("peso").value) || 0;
    const alto = parseFloat(document.getElementById("alto").value) || 0;
    const ancho = parseFloat(document.getElementById("ancho").value) || 0;

    const truckData = { tipo, pesoKg, alto, ancho, updatedAt: new Date().toISOString() };

    // save local
    localStorage.setItem(TRUCK_KEY, JSON.stringify(truckData));
    loadTruckPreview();

    // try save on backend if token exists
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const res = await fetch(`${API_BASE}/api/truck`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify(truckData)
        });
        const j = await res.json();
        if (res.ok && j.truck) {
          localStorage.setItem(TRUCK_KEY, JSON.stringify(j.truck));
          document.getElementById("preview").textContent = JSON.stringify(j.truck, null, 2);
        } else {
          console.warn('Backend no guardó truck:', j);
        }
      } catch (e) {
        console.warn('No se pudo guardar config en backend:', e);
      }
    }

    alert('Configuración guardada ✅');
  });

  document.getElementById("borrarBtn").addEventListener("click", () => {
    if (!confirm("¿Borrar configuración guardada?")) return;
    localStorage.removeItem(TRUCK_KEY);
    alert("Configuración borrada.");
    loadTruckPreview();
  });
