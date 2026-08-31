-- ══════════════════════════════════════════════════════════════
--  gastos · V6 · fecha Y HORA de la compra (no la del escaneo)
--
--  spent_on (DATE) sigue siendo la fecha de compra para agrupar por mes.
--  spent_at (TIMESTAMPTZ) guarda el momento exacto de la compra cuando el
--  comprobante trae la hora. created_at sigue siendo la fecha de registro.
-- ══════════════════════════════════════════════════════════════
ALTER TABLE expense ADD COLUMN spent_at TIMESTAMPTZ;

-- Backfill: los gastos previos toman la medianoche de su fecha de compra.
UPDATE expense SET spent_at = spent_on::timestamptz WHERE spent_at IS NULL;
