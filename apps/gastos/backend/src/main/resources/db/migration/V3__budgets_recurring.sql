-- ══════════════════════════════════════════════════════════════
--  gastos · V3 · presupuestos por categoría + gastos recurrentes
-- ══════════════════════════════════════════════════════════════

-- Presupuesto mensual por categoría (por usuario).
CREATE TABLE budget (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_email TEXT NOT NULL,
    category_id BIGINT NOT NULL REFERENCES category(id) ON DELETE CASCADE,
    amount      NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    UNIQUE (owner_email, category_id)
);

-- Reglas de gasto recurrente (suscripciones, arriendo, etc.).
CREATE TABLE recurring (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_email  TEXT NOT NULL,
    amount       NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    currency     TEXT NOT NULL DEFAULT 'COP',
    category_id  BIGINT REFERENCES category(id) ON DELETE SET NULL,
    merchant     TEXT,
    description  TEXT,
    day_of_month INT NOT NULL DEFAULT 1 CHECK (day_of_month BETWEEN 1 AND 28),
    active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Vínculo del gasto con la regla recurrente que lo generó (para no duplicar).
ALTER TABLE expense ADD COLUMN recurring_id BIGINT;
CREATE INDEX idx_expense_recurring ON expense (owner_email, recurring_id, spent_on);
