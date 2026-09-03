-- ══════════════════════════════════════════════════════════════
--  electrolineras · V2 · siembra de ecoestaciones de ESSA
--  (Electrificadora de Santander · Grupo EPM)
--
--  Las ecoestaciones de ESSA no aparecen en las fuentes abiertas que
--  sincroniza el backend (el dataset de datos.gov.co es de EPM y OSM solo
--  tiene una). Se siembran aquí con coordenadas reales (POIs de OSM /
--  geocodificación de sus ubicaciones publicadas). source='essa' → la
--  sincronización periódica NO las toca (upsert por (source, external_id)).
--  ON CONFLICT DO NOTHING: re-ejecutar es seguro.
-- ══════════════════════════════════════════════════════════════
INSERT INTO station (source, external_id, name, operator, city, address, lat, lon, connectors, speed, hours, website, source_active)
VALUES
  ('essa', 'essa-cacique',   'Ecoestación ESSA · C.C. Cacique',        'ESSA', 'Bucaramanga', 'Centro Comercial Cacique',                     7.0992729, -73.1072592, 'Tipo 1, Tipo 2', 'Rápida',       NULL, 'https://www.essa.com.co', TRUE),
  ('essa', 'essa-cra21-45',  'Ecoestación ESSA · Carrera 21 con Calle 45', 'ESSA', 'Bucaramanga', 'Carrera 21 con Calle 45',                  7.0913984, -73.1152398, 'Tipo 1, Tipo 2', 'Rápida',       NULL, 'https://www.essa.com.co', TRUE),
  ('essa', 'essa-la-florida','Ecoestación ESSA · C.C. La Florida',     'ESSA', 'Floridablanca', 'Centro Comercial La Florida (Cañaveral)',      7.0705248, -73.1054792, 'Tipo 1, Tipo 2', 'Semi-rápida', NULL, 'https://www.essa.com.co', TRUE),
  ('essa', 'essa-san-gil',   'Ecoestación ESSA · C.C. El Puente',      'ESSA', 'San Gil',      'Centro Comercial El Puente (2.º piso, parqueadero)', 6.5515091, -73.1339279, 'Tipo 1, Tipo 2', 'Semi-rápida', NULL, 'https://www.essa.com.co', TRUE),
  ('essa', 'essa-san-rafael','Ecoestación ESSA · EDS San Rafael',      'ESSA', 'Girón',        'EDS San Rafael (Petrobras), autopista Bucaramanga-Girón', 7.1166407, -73.1201270, 'Tipo 1, Tipo 2', 'Rápida', NULL, 'https://www.essa.com.co', TRUE)
ON CONFLICT (source, external_id) DO NOTHING;
