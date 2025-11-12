const API_BASE = "http://localhost:4000";

// Inicializar el mapa centrado en Colombia
const map = L.map("map").setView([4.5709, -74.2973], 6);

// Capa base (mapa visual)
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

// Función para obtener coordenadas con Nominatim (geocodificación)
async function getCoords(city) {
  const res = await axios.get(
    `https://nominatim.openstreetmap.org/search?format=json&q=${city}`
  );
  if (res.data.length === 0) throw new Error("Ciudad no encontrada");
  const { lat, lon } = res.data[0];
  return [parseFloat(lat), parseFloat(lon)];
}

// Manejar el clic del botón
document.getElementById("buscarBtn").addEventListener("click", async () => {
  const origen = document.getElementById("origen").value;
  const destino = document.getElementById("destino").value;

  if (!origen || !destino) {
    alert("Por favor ingresa origen y destino");
    return;
  }

  try {
    const start = await getCoords(origen);
    const end = await getCoords(destino);

    // Dibujar marcadores
    const startMarker = L.marker(start).addTo(map).bindPopup(`Origen: ${origen}`);
    const endMarker = L.marker(end).addTo(map).bindPopup(`Destino: ${destino}`);

    // Centrar el mapa en la ruta
    map.fitBounds([start, end]);

    // Solicitar ruta a OpenRouteService (requiere API key)
    // 🔹 Sustituye YOUR_API_KEY por tu clave gratuita de https://openrouteservice.org
    const apiKey = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6Ijk1YmQ3NmQ2MmQ1ZTQ1NTJhNWNlOWRkZWNkNjZkZGY0IiwiaCI6Im11cm11cjY0In0=";
    const response = await axios.post(
      "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
      {
        coordinates: [
          [start[1], start[0]],
          [end[1], end[0]],
        ],
      },
      {
        headers: {
          Authorization: apiKey,
          "Content-Type": "application/json",
        },
      }
    );

    // Dibujar la ruta en el mapa
    const route = L.geoJSON(response.data, {
      style: { color: "blue", weight: 4 },
    }).addTo(map);
  } catch (error) {
    console.error(error);
    alert("No se pudo calcular la ruta. Verifica los nombres o API key.");
  }
});
