// js/mapa.js (frontend) — usa proxy en :3000 y backend en :4000
const PROXY_BASE = "http://localhost:3000"; // proxy que creamos (nominatim + ORS)
const API_BASE = "http://localhost:4000";   // tu backend (auth, truck, trips)



document.addEventListener("DOMContentLoaded", () => {
  const map = L.map("map").setView([4.5709, -74.2973], 6);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  // utils
  function isLatLon(text) {
    if (!text) return false;
    const regex = /^\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*$/;
    return regex.test(text);
  }
  function parseLatLon(text) {
    const parts = text.split(",").map(s => parseFloat(s.trim()));
    return [parts[0], parts[1]];
  }

  async function geocodeAddressProxy(text) {
    // llama al proxy local que hace la petición a Nominatim
    const r = await axios.get(`${PROXY_BASE}/api/geocode`, { params: { q: text } });
    if (!r.data || r.data.length === 0) throw new Error("No se encontró la dirección: " + text);
    const { lat, lon } = r.data[0];
    return [parseFloat(lat), parseFloat(lon)];
  }

  async function resolveToCoords(inputText) {
    if (isLatLon(inputText)) return parseLatLon(inputText);
    return await geocodeAddressProxy(inputText);
  }

  async function loadTruckConfig() {
    // 1) localStorage fallback
    const local = localStorage.getItem('truckroute_truckConfig');
    if (local) {
      try { return JSON.parse(local); } catch {}
    }
    // 2) si hay token, intentar backend
    const token = localStorage.getItem('token');
    if (!token) return null;
    try {
      const resp = await fetch(`${API_BASE}/api/truck`, { headers: { 'Authorization': 'Bearer ' + token }});
      if (!resp.ok) return null;
      const j = await resp.json();
      return j.truck || null;
    } catch (e) { console.warn('loadTruckConfig error', e); return null; }
  }

  // factors
  const TipoFactors = { turbo: 0.95, camion: 1.00, mula: 1.10, grua: 1.15, patineta: 1.05 };
  function pesoMultiplier(pesoKg) {
    const referencia = 8000;
    if (!pesoKg || pesoKg <= 0) return 1;
    let mult = 1 + 0.000035 * (pesoKg - referencia);
    if (mult < 0.7) mult = 0.7;
    if (mult > 2.5) mult = 2.5;
    return mult;
  }
  function totalMultiplier(tipo, pesoKg) {
    const tipoNorm = (tipo || "camion").toLowerCase();
    const factorTipo = TipoFactors[tipoNorm] !== undefined ? TipoFactors[tipoNorm] : 1.0;
    const factorPeso = pesoMultiplier(pesoKg);
    return { factorTipo, factorPeso, factorTotal: factorTipo * factorPeso };
  }

  // estado
  let currentRouteLayer = null, startMarker = null, endMarker = null, markMode = null;
  const buscarBtn = document.getElementById("buscarBtn");
  const markOriginBtn = document.getElementById("markOriginBtn");
  const markDestBtn = document.getElementById("markDestBtn");
  const infoBox = document.getElementById("infoRuta");

  if (!buscarBtn) { console.error("No se encontró #buscarBtn"); return; }

  markOriginBtn && markOriginBtn.addEventListener("click", () => { markMode = "origin"; alert("Clic en el mapa para ORIGEN"); });
  markDestBtn && markDestBtn.addEventListener("click", () => { markMode = "dest"; alert("Clic en el mapa para DESTINO"); });

  map.on("click", async (e) => {
    if (!markMode) return;
    const lat = e.latlng.lat, lon = e.latlng.lng;
    // reverse geocode via proxy (we can reuse Nominatim reverse if needed)
    try {
      const r = await axios.get(`${PROXY_BASE}/api/geocode`, { params: { q: `${lat},${lon}` } });
      const addr = (r.data && r.data[0] && (r.data[0].display_name || `${r.data[0].lat},${r.data[0].lon}`)) || `${lat},${lon}`;
      if (markMode === "origin") {
        if (startMarker) try { map.removeLayer(startMarker); } catch(_) {}
        startMarker = L.marker([lat, lon]).addTo(map).bindPopup(addr).openPopup();
        document.getElementById("origen").value = `${lat.toFixed(6)},${lon.toFixed(6)}`;
      } else {
        if (endMarker) try { map.removeLayer(endMarker); } catch(_) {}
        endMarker = L.marker([lat, lon]).addTo(map).bindPopup(addr).openPopup();
        document.getElementById("destino").value = `${lat.toFixed(6)},${lon.toFixed(6)}`;
      }
    } catch (e) {
      console.warn('reverse geocode failed', e);
    }
    markMode = null;
  });

  // calcular ruta
  buscarBtn.addEventListener("click", async () => {
    const origenTxt = document.getElementById("origen").value.trim();
    const destinoTxt = document.getElementById("destino").value.trim();
    if (!origenTxt || !destinoTxt) { alert("Ingresa origen y destino"); return; }

    try {
      infoBox.textContent = "Resolviendo origen...";
      const start = await resolveToCoords(origenTxt);
      infoBox.textContent = "Resolviendo destino...";
      const end = await resolveToCoords(destinoTxt);

      // limpiar previos
      if (startMarker) { try { map.removeLayer(startMarker); } catch(_){}; startMarker = null; }
      if (endMarker) { try { map.removeLayer(endMarker); } catch(_){}; endMarker = null; }
      if (currentRouteLayer) { try { map.removeLayer(currentRouteLayer); } catch(_){}; currentRouteLayer = null; }

      startMarker = L.marker(start).addTo(map).bindPopup(`Origen: ${origenTxt}`).openPopup();
      endMarker = L.marker(end).addTo(map).bindPopup(`Destino: ${destinoTxt}`);

      map.fitBounds([start, end], { padding: [40, 40] });
      infoBox.textContent = "Solicitando ruta al servicio...";

      // prepara body para proxy ORS (driving-hgv usa profile params si se envían)
            // --- NUEVO BLOQUE: llamada directa al backend ---
      const truck = await loadTruckConfig();
      const pesoKg = truck ? Number(truck.pesoKg || 0) : 0;
      const tipo = truck ? (truck.tipo || 'camion') : 'camion';

      // enviar coordenadas al backend
      const startParam = `${start[1]},${start[0]}`; // lng,lat
      const endParam = `${end[1]},${end[0]}`;       // lng,lat

      infoBox.textContent = "Solicitando ruta al backend...";
      const r = await axios.get(`${API_BASE}/api/ruta`, {
        params: { start: startParam, end: endParam },
        timeout: 30000
      });

      const data = r.data;
      const coords = data.coords || [];
      const distanceMeters = data.distance_m || 0;
      const durationSeconds = data.duration_s || 0;

      // dibujar la ruta
      if (currentRouteLayer) { try { map.removeLayer(currentRouteLayer); } catch(_){}; currentRouteLayer = null; }
      if (coords.length > 0) {
        currentRouteLayer = L.polyline(coords, { color: 'blue', weight: 4 }).addTo(map);
        map.fitBounds(currentRouteLayer.getBounds(), { padding: [40,40] });
      } else {
        alert("No se recibieron coordenadas para dibujar la ruta");
      }

      const { factorTipo, factorPeso, factorTotal } = totalMultiplier(tipo, pesoKg);
      const adjustedSeconds = Math.round(durationSeconds * factorTotal);

      const km = (distanceMeters / 1000).toFixed(1);
      const apiH = Math.floor(durationSeconds / 3600), apiM = Math.round((durationSeconds % 3600) / 60);
      const adjH = Math.floor(adjustedSeconds / 3600), adjM = Math.round((adjustedSeconds % 3600) / 60);

      infoBox.innerHTML = `
        <div><strong>Distancia:</strong> ${km} km</div>
        <div><strong>Duración (API):</strong> ${apiH}h ${apiM}m</div>
        <div><strong>Tipo:</strong> ${tipo} — <strong>Factor tipo:</strong> ${factorTipo.toFixed(3)}</div>
        <div><strong>Peso:</strong> ${pesoKg || 'no especificado'} kg — <strong>Factor peso:</strong> ${factorPeso.toFixed(3)}</div>
        <div><strong>Duración ajustada:</strong> ${adjH}h ${adjM}m (factor total: ${factorTotal.toFixed(3)})</div>
      `;

      // OPTIONAL: guardar trip en backend si token
      const token = localStorage.getItem('token');
      if (token) {
        try {
          await fetch(`${API_BASE}/api/trips`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({
              origen: origenTxt,
              destino: destinoTxt,
              origin_coords: { lat: start[0], lon: start[1] },
              dest_coords: { lat: end[0], lon: end[1] },
              distance_m: distanceMeters,
              duration_s: durationSeconds,
              duration_adj_s: adjustedSeconds,
              truck_snapshot: truck || null
            })
          });
        } catch (e) { console.warn('no se guardó trip en backend', e); }
      }

    } catch (err) {
      console.error(err);
      alert(err.message || 'Error calculando ruta');
      infoBox.textContent = 'Error';
    }
  });

}); // end DOMContentLoaded
