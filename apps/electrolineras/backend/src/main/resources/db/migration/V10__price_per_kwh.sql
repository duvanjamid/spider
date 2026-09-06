-- ══════════════════════════════════════════════════════════════
--  electrolineras · V10 · precio por kWh (3 capas)
--  Las fuentes abiertas casi nunca traen tarifa fiable, así que el
--  precio se arma por capas, con esta prioridad al mostrarlo:
--    1) admin  → tarifa oficial fijada por el administrador
--    2) comunidad → promedio de lo que reportan los usuarios
--    3) externa → estimado de una fuente (p.ej. OpenChargeMap UsageCost)
--  Todo en COP por kWh.
-- ══════════════════════════════════════════════════════════════

-- Capas admin y externa: en la propia estación.
ALTER TABLE station ADD COLUMN price_admin NUMERIC(8,2);   -- tarifa oficial (admin)
ALTER TABLE station ADD COLUMN price_ext   NUMERIC(8,2);   -- estimado de fuente externa

-- Capa comunidad: un precio por usuario y estación (editable → upsert).
CREATE TABLE station_price (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    station_id  BIGINT       NOT NULL REFERENCES station(id) ON DELETE CASCADE,
    owner_email TEXT         NOT NULL,
    price_cop   NUMERIC(8,2) NOT NULL CHECK (price_cop >= 0),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (station_id, owner_email)
);
CREATE INDEX idx_price_station ON station_price (station_id);
