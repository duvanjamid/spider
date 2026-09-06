-- Impuestos / cargos por gasto (IVA, impuesto al consumo, propina/servicio, etc.)
-- El total del gasto (expense.amount) YA los incluye: aquí se guarda cuánto de
-- ese total corresponde a cada impuesto/cargo, para poder responder «de $100.000
-- pagaste $19.000 de impuestos». Un gasto puede tener varios.
CREATE TABLE expense_tax (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    expense_id BIGINT NOT NULL REFERENCES expense(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL,                 -- etiqueta del impuesto/cargo (p.ej. "IVA")
    amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_expense_tax_expense ON expense_tax(expense_id);
