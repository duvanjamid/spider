-- ══════════════════════════════════════════════════════════════
--  admin · V2 · concesión de acceso por correo
--  Permite conceder acceso a una app por email ANTES de que el
--  usuario haya iniciado sesión (se resuelve por correo, no por id).
--  Sin prefijo de schema: Flyway fija el schema por defecto.
-- ══════════════════════════════════════════════════════════════
CREATE TABLE access_grant (
    id             BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email          TEXT        NOT NULL,
    application_id BIGINT      NOT NULL REFERENCES application(id) ON DELETE CASCADE,
    role           TEXT        NOT NULL DEFAULT 'USER',   -- USER | ADMIN
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (email, application_id)
);

CREATE INDEX idx_access_grant_email ON access_grant (lower(email));
