-- ══════════════════════════════════════════════════════════════
--  gastos · V7 · detalle de productos por factura (para comparar precios)
--
--  Cada línea de la factura (producto) se guarda con su nombre, cantidad,
--  precio unitario y total. name_norm es el nombre normalizado (minúsculas,
--  sin tildes) para agrupar "papas"/"Papas" al comparar precios por tienda.
--  La tienda es el `merchant` del gasto (expense). Sin prefijo de schema.
-- ══════════════════════════════════════════════════════════════
CREATE TABLE expense_item (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    expense_id  BIGINT NOT NULL REFERENCES expense(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    name_norm   TEXT NOT NULL,
    quantity    NUMERIC(12,3),
    unit_price  NUMERIC(12,2),
    line_total  NUMERIC(12,2),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_expense_item_expense ON expense_item (expense_id);
CREATE INDEX idx_expense_item_norm    ON expense_item (name_norm);
