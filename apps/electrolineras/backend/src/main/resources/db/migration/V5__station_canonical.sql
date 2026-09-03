-- ══════════════════════════════════════════════════════════════
--  electrolineras · V5 · deduplicación por cercanía (agregación de fuentes)
--
--  La misma estación física puede venir de varias fuentes (OSM, Open Charge
--  Map, EPM, ESSA) y hasta ahora se pintaba como pines repetidos. Se añade
--  `canonical_id`: apunta a la estación "representante" de un grupo de
--  estaciones co-ubicadas. El backend agrupa por cercanía tras cada sync y
--  el listado/detalle consolidan conectores y fuentes por canónico, sin
--  perder el detalle de cada origen.
--
--    canonical_id = id           → representante del grupo (o estación única)
--    canonical_id = otro id      → miembro que se consolida en ese canónico
--    canonical_id IS NULL        → aún sin agrupar (se trata como su propio grupo)
-- ══════════════════════════════════════════════════════════════
ALTER TABLE station ADD COLUMN canonical_id BIGINT REFERENCES station(id) ON DELETE SET NULL;
CREATE INDEX idx_station_canonical ON station (canonical_id);
