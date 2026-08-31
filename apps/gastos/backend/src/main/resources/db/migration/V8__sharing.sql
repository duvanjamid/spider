-- ══════════════════════════════════════════════════════════════
--  gastos · V8 · compartir con el hogar (conexiones + compartición)
--
--  - connection: vínculo entre dos usuarios (por correo). Nace 'pending'
--    (invitación) y pasa a 'accepted' cuando el destinatario acepta.
--  - expense_share: un gasto puntual compartido con un miembro (correo).
--  - category_share: una categoría (por slug del dueño) compartida con un
--    miembro. Al ser "común a ambos", la visibilidad es mutua para ese slug.
--  Sin prefijo de schema (Flyway lo fija).
-- ══════════════════════════════════════════════════════════════
CREATE TABLE connection (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    requester_email TEXT NOT NULL,
    addressee_email TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',   -- pending | accepted
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    responded_at    TIMESTAMPTZ,
    CONSTRAINT connection_pair_key UNIQUE (requester_email, addressee_email),
    CONSTRAINT connection_not_self CHECK (requester_email <> addressee_email)
);
CREATE INDEX idx_connection_addressee ON connection (addressee_email, status);
CREATE INDEX idx_connection_requester ON connection (requester_email, status);

CREATE TABLE expense_share (
    expense_id  BIGINT NOT NULL REFERENCES expense(id) ON DELETE CASCADE,
    shared_with TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (expense_id, shared_with)
);
CREATE INDEX idx_expense_share_with ON expense_share (shared_with);

CREATE TABLE category_share (
    owner_email TEXT NOT NULL,
    slug        TEXT NOT NULL,
    shared_with TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (owner_email, slug, shared_with)
);
CREATE INDEX idx_category_share_with  ON category_share (shared_with, slug);
CREATE INDEX idx_category_share_owner ON category_share (owner_email, slug);
