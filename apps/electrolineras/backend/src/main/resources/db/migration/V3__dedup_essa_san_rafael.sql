-- ══════════════════════════════════════════════════════════════
--  electrolineras · V3 · quita el duplicado de la ecoestación San Rafael
--
--  La ecoestación ESSA de la EDS San Rafael (Petrobras) ya viene de OSM vía
--  la sincronización (source='osm', mismas coordenadas). La sembrada en V2
--  con source='essa' quedaba como pin duplicado en el mismo punto. Se elimina
--  la sembrada y se conserva la de OSM.
-- ══════════════════════════════════════════════════════════════
DELETE FROM station WHERE source = 'essa' AND external_id = 'essa-san-rafael';
