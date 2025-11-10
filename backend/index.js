// backend/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();

// CORS - permitir desde Live Server (ajusta orígenes en producción)
app.use(cors({
  origin: ['http://127.0.0.1:5500', 'http://localhost:5500'],
  credentials: true
}));

app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const JWT_EXP = '7d';

// ---- util ----
function genToken(payload){
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXP });
}
function authMiddleware(req, res, next){
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'No token' });
  const parts = auth.split(' ');
  if (parts.length !== 2) return res.status(401).json({ error: 'Formato token inválido' });
  const token = parts[1];
  try {
    const data = jwt.verify(token, JWT_SECRET);
    req.user = data;
    next();
  } catch (e){
    return res.status(401).json({ error: 'Token inválido' });
  }
}

// ---- Routes ----

// registro
app.post('/api/auth/register', async (req, res) => {
  const { email, password, display_name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email y password requeridos' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await db.query(
      'INSERT INTO users (email, password_hash, display_name) VALUES ($1,$2,$3) RETURNING id,email,display_name,created_at',
      [email.toLowerCase(), hash, display_name || null]
    );
    const user = result.rows[0];
    const token = genToken({ id: user.id, email: user.email });
    res.json({ user, token });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Email ya registrado' });
    console.error(err);
    res.status(500).json({ error: 'error servidor' });
  }
});

// login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email y password requeridos' });
  try {
    const r = await db.query('SELECT id, email, password_hash, display_name FROM users WHERE email=$1', [email.toLowerCase()]);
    if (!r.rows.length) return res.status(401).json({ error: 'Credenciales inválidas' });
    const user = r.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });
    const token = genToken({ id: user.id, email: user.email });
    res.json({ user: { id: user.id, email: user.email, display_name: user.display_name }, token });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error en login' });
  }
});

// obtener perfil
app.get('/api/user', authMiddleware, async (req, res) => {
  try {
    const r = await db.query('SELECT id,email,display_name,created_at FROM users WHERE id=$1', [req.user.id]);
    res.json({ user: r.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error obteniendo usuario' });
  }
});

// guardar config del camión
app.post('/api/truck', authMiddleware, async (req, res) => {
  const { tipo, pesoKg, alto, ancho, meta } = req.body;
  try {
    const existing = await db.query('SELECT id FROM truck_configs WHERE user_id=$1', [req.user.id]);
    if (existing.rows.length) {
      const upd = await db.query(
        `UPDATE truck_configs SET tipo=$1, peso_kg=$2, alto=$3, ancho=$4, meta=$5, updated_at = now() WHERE user_id=$6 RETURNING *`,
        [tipo, pesoKg, alto, ancho, meta || null, req.user.id]
      );
      return res.json({ truck: upd.rows[0] });
    } else {
      const ins = await db.query(
        `INSERT INTO truck_configs (user_id, tipo, peso_kg, alto, ancho, meta) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [req.user.id, tipo, pesoKg, alto, ancho, meta || null]
      );
      return res.json({ truck: ins.rows[0] });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error guardando config' });
  }
});

// obtener config del camión del usuario
app.get('/api/truck', authMiddleware, async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM truck_configs WHERE user_id=$1', [req.user.id]);
    res.json({ truck: r.rows[0] || null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error obteniendo truck config' });
  }
});

// guardar un trip
app.post('/api/trips', authMiddleware, async (req, res) => {
  const { origen, destino, origin_coords, dest_coords, distance_m, duration_s, duration_adj_s, truck_snapshot } = req.body;
  try {
    const r = await db.query(
      `INSERT INTO trips (user_id, origen, destino, origin_coords, dest_coords, distance_m, duration_s, duration_adj_s, truck_snapshot)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.id, origen, destino, origin_coords || null, dest_coords || null, distance_m || 0, duration_s || 0, duration_adj_s || 0, truck_snapshot || null]
    );
    res.json({ trip: r.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error guardando trip' });
  }
});

// listar trips del usuario
app.get('/api/trips', authMiddleware, async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM trips WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200', [req.user.id]);
    res.json({ trips: r.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error listando trips' });
  }
});

const axios = require('axios');

// === Geocodificación: ciudad → coordenadas ===
app.get('/api/geocode', async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: 'Falta parámetro q' });
  try {
    const r = await axios.get('https://api.openrouteservice.org/geocode/search', {
      params: { api_key: process.env.ORS_API_KEY, text: q, size: 1 }
    });
    if (!r.data.features?.length) {
      return res.status(404).json({ error: 'No se encontraron coordenadas' });
    }
    const coords = r.data.features[0].geometry.coordinates; // [lng, lat]
    // devolver tanto en [lng,lat] como en {lat, lng} para evitar confusiones
    res.json({ coords, latlng: { lat: coords[1], lng: coords[0] } });
  } catch (e) {
    console.error('Error en /api/geocode', e.response?.data || e.message);
    res.status(500).json({ error: 'Fallo geocodificación', detalle: e.response?.data || e.message });
  }
});


// === Ruta: coordenadas → distancia y duración ===
// === Ruta: coordenadas → distancia y duración ===
// === Ruta: coordenadas -> distancia y duración (con logging y fallback) ===
// === Ruta: coordenadas -> distancia y duración (con logging y fallback) ===
// === Ruta: coordenadas -> distancia y duración (robusta) ===
app.get('/api/ruta', async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'Faltan parámetros start y end (format: lng,lat)' });

  try {
    console.log('---- /api/ruta request raw ----', { start, end });

    const parsePair = s => s.split(',').map(Number);
    const p1 = parsePair(start); // esperamos [lng, lat]
    const p2 = parsePair(end);

    if (p1.length !== 2 || p2.length !== 2 || p1.some(isNaN) || p2.some(isNaN)) {
      return res.status(400).json({ error: 'Formato inválido de start/end. Debe ser "lng,lat" con números' });
    }

    // Asumimos start/end vienen "lng,lat"
    let [lon1, lat1] = p1;
    let [lon2, lat2] = p2;

    // Sanity check: lat debe estar en [-90,90]. Si no, intentamos swap (probable caso lat,lng)
    if (Math.abs(lat1) > 90 || Math.abs(lat2) > 90) {
      console.warn('Saneamiento: parece que las coordenadas vienen invertidas; aplicando swap');
      // swap
      lon1 = p1[1]; lat1 = p1[0];
      lon2 = p2[1]; lat2 = p2[0];
    }

    console.log('Parsed coords to use (lon,lat):', { lon1, lat1, lon2, lat2 });

    // Intento ORS (driving-car)
    try {
      const r = await axios.post(
        'https://api.openrouteservice.org/v2/directions/driving-car',
        { coordinates: [[lon1, lat1], [lon2, lat2]] },
        { headers: { 'Content-Type': 'application/json', 'Authorization': process.env.ORS_API_KEY }, timeout: 15000 }
      );

      if (!r.data?.routes?.length) throw new Error('ORS no devolvió rutas');

      const route = r.data.routes[0];
      // convertir coords a [lat,lng] para Leaflet
      const coordsLatLng = (route.geometry.coordinates || []).map(c => [c[1], c[0]]);
      return res.json({ distance_m: route.summary.distance, duration_s: route.summary.duration, coords: coordsLatLng });
    } catch (orsErr) {
      console.error('ORS error:', orsErr.response?.status, orsErr.response?.data || orsErr.message);

      // Fallback OSRM (sin key) para no quedarnos parados
      try {
        console.log('Intentando fallback con OSRM público...');
        const coordsStr = `${lon1},${lat1};${lon2},${lat2}`;
        const osrmUrl = `http://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`;
        const or = await axios.get(osrmUrl, { timeout: 15000 });
        if (!or.data?.routes?.length) throw new Error('OSRM no devolvió rutas');
        const r2 = or.data.routes[0];
        const coords = r2.geometry.coordinates.map(c => [c[1], c[0]]);
        return res.json({ distance_m: r2.distance, duration_s: r2.duration, coords });
      } catch (osrmErr) {
        console.error('OSRM fallback error:', osrmErr.response?.data || osrmErr.message);
        return res.status(500).json({
          error: 'ORS y OSRM fallaron',
          ors: orsErr.response?.data || orsErr.message,
          osrm: osrmErr.response?.data || osrmErr.message
        });
      }
    }

  } catch (e) {
    console.error('Unexpected /api/ruta error:', e && e.stack ? e.stack : e);
    res.status(500).json({ error: 'Error interno', detalle: e.message || e });
  }
});





const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log('API listening on', PORT));
