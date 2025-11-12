// server.js (proxy para Nominatim + OpenRouteService)
// run: node server.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(express.json());
// permitir front (Live Server / 127.0.0.1:5500) y backend
app.use(cors({
  origin: ['http://127.0.0.1:5500', 'http://localhost:5500', 'http://localhost:4000', 'http://127.0.0.1:3000'],
  credentials: true
}));

const ORS_API_KEY = process.env.ORS_API_KEY || ''; // ponla en .env

// Proxy para geocodificación (Nominatim) — añade User-Agent/email para evitar 403
app.get('/api/geocode', async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: 'falta parámetro q' });
  try {
    const r = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: { format: 'json', q, limit: 5 },
      headers: {
        'User-Agent': 'TruckRouteApp/1.0 (tu_email@dominio.com)',
        // opcional: 'Referer': 'http://localhost'
      },
      timeout: 10000
    });
    res.json(r.data);
  } catch (e) {
    console.error('geocode error:', e.response?.data || e.message);
    res.status(500).json({ error: e.response?.data || e.message });
  }
});

// Proxy para ORS routing. Usa ORS_API_KEY del .env aquí, no lo pongas en frontend.
app.post('/api/ruta', async (req, res) => {
  if (!ORS_API_KEY) return res.status(500).json({ error: 'ORS_API_KEY no configurada en proxy (.env)' });
  try {
    const r = await axios.post(
      'https://api.openrouteservice.org/v2/directions/driving-car/geojson',
      req.body,
      {
        headers: {
          Authorization: ORS_API_KEY,
          'Content-Type': 'application/json',
          Accept: 'application/json, application/geo+json'
        },
        timeout: 30000
      }
    );
    res.json(r.data);
  } catch (e) {
    console.error('ruta error:', e.response?.data || e.message);
    const status = e.response?.status || 500;
    res.status(status).json(e.response?.data || { error: e.message });
  }
});

const PORT = process.env.PROXY_PORT || 3000;
app.listen(PORT, () => console.log(`Proxy en http://localhost:${PORT} (usa /api/geocode y /api/ruta)`));
