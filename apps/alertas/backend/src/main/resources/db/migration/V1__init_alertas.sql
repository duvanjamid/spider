-- ══════════════════════════════════════════════════════════════
--  alertas · V1 · reportes colaborativos de desastres (estilo Waze)
--  (sin prefijo de schema: Flyway fija el schema por defecto)
--
--  Anonimato: el email real se guarda para auditoría/responsabilidad
--  legal, pero la comunidad SOLO ve el seudónimo del reporter.
-- ══════════════════════════════════════════════════════════════

-- Reputación por usuario (identidad seudónima ante la comunidad).
CREATE TABLE reporter (
    owner_email TEXT PRIMARY KEY,
    pseudonym   TEXT        NOT NULL,
    score       INT         NOT NULL DEFAULT 0,
    reports     INT         NOT NULL DEFAULT 0,
    confirmed   INT         NOT NULL DEFAULT 0,
    denied      INT         NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Alertas / reportes.
CREATE TABLE alert (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_email TEXT        NOT NULL,               -- auditoría (no se expone)
    pseudonym   TEXT        NOT NULL,               -- lo que ve la comunidad
    category    TEXT        NOT NULL,
    description TEXT,
    photo       TEXT,                               -- base64 opcional (cap en backend)
    lat         DOUBLE PRECISION NOT NULL,
    lon         DOUBLE PRECISION NOT NULL,
    radius_km   DOUBLE PRECISION NOT NULL,
    status      TEXT        NOT NULL DEFAULT 'activa', -- activa|oficial|crisis|falsa|resuelta
    official    BOOLEAN     NOT NULL DEFAULT FALSE,
    confirms    INT         NOT NULL DEFAULT 0,
    denies      INT         NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ
);
CREATE INDEX idx_alert_status ON alert (status, created_at DESC);
CREATE INDEX idx_alert_geo ON alert (lat, lon);
CREATE INDEX idx_alert_owner ON alert (owner_email, created_at DESC);

-- Votos de confirmación / desmentido (uno por usuario y alerta).
CREATE TABLE alert_vote (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    alert_id    BIGINT      NOT NULL REFERENCES alert(id) ON DELETE CASCADE,
    owner_email TEXT        NOT NULL,
    vote        TEXT        NOT NULL,               -- confirm | deny
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (alert_id, owner_email)
);

-- "Estoy a salvo" (uno por usuario y alerta).
CREATE TABLE safe_status (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    alert_id    BIGINT      REFERENCES alert(id) ON DELETE CASCADE,
    owner_email TEXT        NOT NULL,
    lat         DOUBLE PRECISION,
    lon         DOUBLE PRECISION,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (alert_id, owner_email)
);
