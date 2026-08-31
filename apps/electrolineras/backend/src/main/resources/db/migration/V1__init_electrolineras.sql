-- ══════════════════════════════════════════════════════════════
--  electrolineras · V1 · catálogo de estaciones + reportes comunitarios
--  (sin prefijo de schema: Flyway fija el schema por defecto)
--
--  El catálogo base se sincroniza desde datos abiertos del gobierno
--  (datos.gov.co). El estado en tiempo real no está en datos abiertos:
--  se cubre con reportes de la comunidad (estación/cargador) + comentarios.
--  El modelo guarda conector y potencia (compatible con OCPI a futuro).
-- ══════════════════════════════════════════════════════════════

-- ── Estación de carga ──
CREATE TABLE station (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source        TEXT        NOT NULL,              -- 'datos_gov_epm', 'manual', …
    external_id   TEXT        NOT NULL,              -- id estable en la fuente
    name          TEXT        NOT NULL,
    operator      TEXT,                              -- EPM, Terpel, …
    city          TEXT,
    address       TEXT,
    lat           DOUBLE PRECISION,
    lon           DOUBLE PRECISION,
    connectors    TEXT,                              -- estándares de conector (texto crudo de la fuente)
    speed         TEXT,                              -- Rápida / Semi-rápida / …
    hours         TEXT,
    website       TEXT,
    source_active BOOLEAN,                           -- estado según la fuente, si lo trae
    raw           TEXT,                              -- fila original (JSON) para trazabilidad
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source, external_id)
);
CREATE INDEX idx_station_geo ON station (lat, lon);
CREATE INDEX idx_station_city ON station (city);

-- ── Cargador/conector dentro de una estación (si se conoce el detalle) ──
CREATE TABLE charger (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    station_id    BIGINT      NOT NULL REFERENCES station(id) ON DELETE CASCADE,
    label         TEXT        NOT NULL,              -- 'CCS2', 'Tipo 2', 'Cargador 1'…
    connector_type TEXT,
    power_kw      NUMERIC(6,1),
    UNIQUE (station_id, label)
);

-- ── Reporte comunitario de estado ──
--   charger_id NULL  → reporte de la ESTACIÓN (active/inactive)
--   charger_id set   → reporte de un CARGADOR   (free/busy/broken)
CREATE TABLE status_report (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    station_id  BIGINT      NOT NULL REFERENCES station(id) ON DELETE CASCADE,
    charger_id  BIGINT      REFERENCES charger(id) ON DELETE CASCADE,
    owner_email TEXT        NOT NULL,
    status      TEXT        NOT NULL,                -- active|inactive|free|busy|broken
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_report_station ON status_report (station_id, created_at DESC);
CREATE INDEX idx_report_charger ON status_report (charger_id, created_at DESC);

-- ── Comentario de una estación ──
CREATE TABLE station_comment (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    station_id  BIGINT      NOT NULL REFERENCES station(id) ON DELETE CASCADE,
    owner_email TEXT        NOT NULL,
    body        TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_comment_station ON station_comment (station_id, created_at DESC);
