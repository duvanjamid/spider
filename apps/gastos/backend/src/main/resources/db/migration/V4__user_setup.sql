-- ══════════════════════════════════════════════════════════════
--  gastos · V4 · estado de "onboarding" por usuario
--
--  En el primer ingreso el usuario elige sus categorías de un set base
--  (ya no se siembran automáticamente). Esta tabla recuerda que el
--  usuario completó ese paso. Sin prefijo de schema (Flyway lo fija).
-- ══════════════════════════════════════════════════════════════
CREATE TABLE user_setup (
    owner_email  TEXT PRIMARY KEY,
    onboarded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Los usuarios que YA tienen categorías (sembradas antes de esta versión)
-- se consideran onboardeados para no mandarlos al asistente de nuevo.
INSERT INTO user_setup (owner_email)
SELECT DISTINCT owner_email FROM category WHERE owner_email IS NOT NULL
ON CONFLICT (owner_email) DO NOTHING;
