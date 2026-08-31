-- ══════════════════════════════════════════════════════════════
--  admin · V1 · esquema inicial
--  Sin prefijo de schema a propósito: Flyway fija el schema por
--  defecto (admin | test_admin), así la MISMA migración sirve para
--  producción y test sobre la misma base de datos.
-- ══════════════════════════════════════════════════════════════

-- ── Usuarios (identidad federada por Google) ──
CREATE TABLE app_user (
    id            BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    google_sub    TEXT        NOT NULL UNIQUE,   -- "sub" del token de Google
    email         TEXT        NOT NULL UNIQUE,
    display_name  TEXT,
    picture_url   TEXT,
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ
);

-- ── Registro de apps del ecosistema Spider ──
CREATE TABLE application (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug        TEXT        NOT NULL UNIQUE,      -- p.ej. "admin", "crm"
    name        TEXT        NOT NULL,
    description TEXT,
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Acceso de un usuario a una app, con rol ──
CREATE TABLE user_app_access (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id        BIGINT      NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    application_id BIGINT      NOT NULL REFERENCES application(id) ON DELETE CASCADE,
    role           TEXT        NOT NULL DEFAULT 'USER',  -- USER | ADMIN
    granted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, application_id)
);

CREATE INDEX idx_user_app_access_user ON user_app_access(user_id);
CREATE INDEX idx_user_app_access_app  ON user_app_access(application_id);

-- Semilla: la propia app admin queda registrada.
INSERT INTO application (slug, name, description)
VALUES ('admin', 'Spider Admin', 'Panel maestro: usuarios, apps y accesos')
ON CONFLICT (slug) DO NOTHING;
