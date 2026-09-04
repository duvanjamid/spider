-- ══════════════════════════════════════════════════════════════
--  electrolineras · V6 · caché de respuestas de las APIs externas
--
--  Cada fuente (datos.gov.co, Overpass/OSM, Open Charge Map, TomTom) guarda su
--  última respuesta cruda aquí. El sync reutiliza la caché mientras esté fresca
--  (TTL ≥ 1 día) en vez de volver a llamar a la API; si la API falla, cae a la
--  caché aunque esté vieja. Persistir en BD hace que sobreviva reinicios del
--  contenedor (en Render/Coolify el contenedor es efímero).
--
--    cache_key  → identificador de la llamada (p.ej. 'ocm:CO', 'tomtom:7.1,-73.1')
--    fetched_at → cuándo se obtuvo (para el TTL)
--    payload    → cuerpo de la respuesta (JSON crudo)
-- ══════════════════════════════════════════════════════════════
CREATE TABLE api_cache (
    cache_key   TEXT        PRIMARY KEY,
    fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    payload     TEXT        NOT NULL
);
