-- ══════════════════════════════════════════════════════════════
--  electrolineras · V11 · favoritas + cobro por tiempo/inactividad
-- ══════════════════════════════════════════════════════════════

-- Favoritas del usuario (una fila por usuario+estación).
CREATE TABLE station_favorite (
    owner_email TEXT        NOT NULL,
    station_id  BIGINT      NOT NULL REFERENCES station(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (owner_email, station_id)
);
CREATE INDEX idx_fav_owner ON station_favorite (owner_email);

-- ¿Cobra por tiempo/inactividad? (dejar conectado sin cargar o ya cargado)
--   admin: bandera autoritativa; comunidad: reporte por usuario (sí/no).
ALTER TABLE station ADD COLUMN idle_fee_admin BOOLEAN;
CREATE TABLE station_idle (
    station_id  BIGINT      NOT NULL REFERENCES station(id) ON DELETE CASCADE,
    owner_email TEXT        NOT NULL,
    charges     BOOLEAN     NOT NULL,      -- true = cobra por tiempo/idle
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (station_id, owner_email)
);
CREATE INDEX idx_idle_station ON station_idle (station_id);
