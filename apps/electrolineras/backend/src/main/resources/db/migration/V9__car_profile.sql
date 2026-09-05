-- ══════════════════════════════════════════════════════════════
--  electrolineras · V9 · perfil del vehículo por usuario
--  Antes vivía solo en localStorage del navegador → no sincronizaba
--  entre dispositivos. Ahora se guarda en BD por correo del usuario.
--  Una fila por usuario (upsert).
-- ══════════════════════════════════════════════════════════════
CREATE TABLE car_profile (
    owner_email TEXT        PRIMARY KEY,
    brand       TEXT        NOT NULL DEFAULT '',
    autonomy_km INTEGER,
    cycle       TEXT        NOT NULL DEFAULT 'WLTP',
    connectors  TEXT        NOT NULL DEFAULT '',   -- CSV: "CCS2,Tipo 2"
    fast_charge BOOLEAN     NOT NULL DEFAULT TRUE,
    body_type   TEXT        NOT NULL DEFAULT 'car',
    color       TEXT        NOT NULL DEFAULT '#3b5bfd',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
