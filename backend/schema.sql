-- schema.sql
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name VARCHAR(100),
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS truck_configs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  tipo VARCHAR(50),
  peso_kg INTEGER,
  alto NUMERIC(5,2),
  ancho NUMERIC(5,2),
  meta JSONB,
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trips (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  origen TEXT,
  destino TEXT,
  origin_coords JSONB,
  dest_coords JSONB,
  distance_m INTEGER,
  duration_s INTEGER,
  duration_adj_s INTEGER,
  truck_snapshot JSONB,
  created_at TIMESTAMP DEFAULT now()
);
