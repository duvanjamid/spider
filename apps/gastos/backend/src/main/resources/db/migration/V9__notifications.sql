-- ══════════════════════════════════════════════════════════════
--  gastos · V9 · notificaciones in-app
--
--  Bandeja de notificaciones por usuario (correo). Se generan cuando:
--   - connection_invite   : alguien te invita a conectar (debes aceptar)
--   - connection_accepted : alguien aceptó tu invitación
--   - category_shared     : alguien compartió una categoría contigo
--   - shared_expense      : alguien subió una compra a una categoría compartida
--
--  read_at NULL = no leída (cuenta para el badge). Sin prefijo de schema.
-- ══════════════════════════════════════════════════════════════
CREATE TABLE notification (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    recipient_email TEXT NOT NULL,
    kind            TEXT NOT NULL,
    title           TEXT NOT NULL,
    body            TEXT,
    actor_email     TEXT,
    ref             TEXT,               -- slug / id de gasto / id de conexión (opcional)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_at         TIMESTAMPTZ
);
CREATE INDEX idx_notification_recipient ON notification (recipient_email, created_at DESC);
CREATE INDEX idx_notification_unread    ON notification (recipient_email, read_at);
