-- ══════════════════════════════════════════════════════════════
--  gastos · V1 · categorías y gastos (sin prefijo de schema: Flyway lo fija)
-- ══════════════════════════════════════════════════════════════

-- ── Categorías de gasto ──
CREATE TABLE category (
    id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug   TEXT NOT NULL UNIQUE,
    name   TEXT NOT NULL,
    color  TEXT NOT NULL DEFAULT '#6c8cff',
    icon   TEXT NOT NULL DEFAULT 'pi-wallet'
);

-- ── Gastos ──
CREATE TABLE expense (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    amount       NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    currency     TEXT NOT NULL DEFAULT 'COP',
    category_id  BIGINT REFERENCES category(id) ON DELETE SET NULL,
    merchant     TEXT,
    description  TEXT,
    spent_on     DATE NOT NULL DEFAULT current_date,
    source       TEXT NOT NULL DEFAULT 'manual',   -- manual | scan
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_expense_spent_on ON expense (spent_on);
CREATE INDEX idx_expense_category ON expense (category_id);

-- ── Semilla de categorías comunes ──
INSERT INTO category (slug, name, color, icon) VALUES
  ('comida',        'Comida',          '#ef4444', 'pi-shopping-cart'),
  ('transporte',    'Transporte',      '#f59e0b', 'pi-car'),
  ('mercado',       'Mercado',         '#10b981', 'pi-shopping-bag'),
  ('servicios',     'Servicios',       '#3b82f6', 'pi-bolt'),
  ('ocio',          'Ocio',            '#a855f7', 'pi-ticket'),
  ('salud',         'Salud',           '#ec4899', 'pi-heart'),
  ('hogar',         'Hogar',           '#14b8a6', 'pi-home'),
  ('otros',         'Otros',           '#9aa3b2', 'pi-ellipsis-h')
ON CONFLICT (slug) DO NOTHING;
