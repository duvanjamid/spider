-- ── Ingresos (para calcular el tope global del mes) ──
CREATE TABLE income (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_email  TEXT        NOT NULL,
    amount       NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    source       TEXT        NOT NULL DEFAULT '',   -- salario, extra, etc.
    received_on  DATE        NOT NULL DEFAULT now(),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX income_owner_month_idx ON income (owner_email, received_on);

-- ── Suscripciones Web Push (una por dispositivo/navegador) ──
CREATE TABLE push_subscription (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_email  TEXT        NOT NULL,
    endpoint     TEXT        NOT NULL,
    p256dh       TEXT        NOT NULL,
    auth         TEXT        NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (endpoint)
);
CREATE INDEX push_sub_owner_idx ON push_subscription (owner_email);

-- ── Anti-repetición de alertas de tope (una vez por categoría/mes) ──
CREATE TABLE budget_alert (
    owner_email  TEXT NOT NULL,
    category_id  BIGINT NOT NULL,
    period       TEXT NOT NULL,               -- 'YYYY-MM'
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (owner_email, category_id, period)
);
