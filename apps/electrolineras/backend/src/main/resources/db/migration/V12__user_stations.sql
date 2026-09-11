-- ══════════════════════════════════════════════════════════════
--  electrolineras · V12 · estaciones agregadas por usuarios
--
--  Cualquier usuario puede registrar una estación que falte (nombre, GPS,
--  pública/privada y sus cargadores con potencia). Se guarda con
--  source='manual' y no la pisa el sync de fuentes abiertas.
--    access   = 'public' | 'private'   (visibilidad/uso de la estación)
--    added_by = correo de quien la registró
-- ══════════════════════════════════════════════════════════════
ALTER TABLE station ADD COLUMN access   TEXT;
ALTER TABLE station ADD COLUMN added_by TEXT;
