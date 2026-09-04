-- ══════════════════════════════════════════════════════════════
--  electrolineras · V7 · calidad de datos
--  Fase 1: correcciones manuales (cargadores editables + verificación).
--  Fase 2: sugerencias de la comunidad, agrupadas por (estación, tipo, valor),
--          con auto-aprobación cuando llegan N iguales (por defecto 3).
-- ══════════════════════════════════════════════════════════════

-- Un cargador puede ser MANUAL (creado/corregido por admin o por sugerencia
-- aprobada). El sync nunca lo pisa ni lo borra.
ALTER TABLE charger ADD COLUMN manual BOOLEAN NOT NULL DEFAULT FALSE;

-- Estación marcada como verificada (datos confirmados).
ALTER TABLE station ADD COLUMN verified BOOLEAN NOT NULL DEFAULT FALSE;

-- Sugerencia de corrección de la comunidad.
--   kind  → qué se sugiere: 'chargers' (nº y tipo), 'name', 'operator', 'closed'
--   value → valor NORMALIZADO para poder agrupar/contar coincidencias
--           (p.ej. chargers = 'CCS2:2|Tipo 2:2')
--   Una persona vota una vez por (estación, tipo); puede cambiar su valor.
CREATE TABLE suggestion (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    station_id   BIGINT      NOT NULL REFERENCES station(id) ON DELETE CASCADE,
    kind         TEXT        NOT NULL,
    value        TEXT        NOT NULL,
    detail       TEXT,
    owner_email  TEXT        NOT NULL,
    status       TEXT        NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
    approved_how TEXT,                                    -- auto | manual | (null)
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at  TIMESTAMPTZ,
    UNIQUE (station_id, kind, owner_email)
);
CREATE INDEX idx_suggestion_group ON suggestion (station_id, kind, value, status);
CREATE INDEX idx_suggestion_status ON suggestion (status, created_at DESC);
