-- ══════════════════════════════════════════════════════════════
--  gastos · V11 · movimientos "míos" vs "hogar"
--
--  Reemplaza el compartir por categoría/gasto por un modelo de HOGAR:
--   - Cada movimiento (gasto/ingreso) lleva un scope: 'mine' | 'home'.
--   - El hogar son los usuarios con conexión aceptada (tabla connection).
--   - 'home' es visible para todos los miembros; lo edita solo quien lo creó.
--   - Recurrentes ahora pueden ser de gasto o de ingreso (kind) y con scope.
--  Se conserva `connection` (invitación/aceptación = miembros del hogar).
-- ══════════════════════════════════════════════════════════════

ALTER TABLE expense ADD COLUMN scope TEXT NOT NULL DEFAULT 'mine';   -- mine | home

ALTER TABLE income  ADD COLUMN scope        TEXT   NOT NULL DEFAULT 'mine';
ALTER TABLE income  ADD COLUMN recurring_id BIGINT;   -- si vino de un ingreso recurrente

ALTER TABLE recurring ADD COLUMN scope TEXT NOT NULL DEFAULT 'mine';
ALTER TABLE recurring ADD COLUMN kind  TEXT NOT NULL DEFAULT 'expense';  -- expense | income
ALTER TABLE recurring ADD COLUMN source TEXT;   -- etiqueta para ingresos recurrentes (salario, etc.)

CREATE INDEX idx_expense_scope ON expense (scope);
CREATE INDEX idx_income_scope  ON income  (scope);
CREATE INDEX idx_income_recurring ON income (recurring_id);

-- Se retira el compartir puntual por gasto/categoría (reemplazado por el hogar).
DROP TABLE IF EXISTS expense_share;
DROP TABLE IF EXISTS category_share;
