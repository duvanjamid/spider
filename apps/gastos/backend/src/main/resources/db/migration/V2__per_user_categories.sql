-- ══════════════════════════════════════════════════════════════
--  gastos · V2 · categorías por usuario (aisladas) + NIT/dueño en gastos
--
--  Las categorías semilla de V1 (owner_email NULL) pasan a ser PLANTILLAS
--  base: al primer acceso de un usuario se copian a su propia lista.
-- ══════════════════════════════════════════════════════════════

-- Dueño de la categoría (NULL = plantilla base, común a todos).
ALTER TABLE category ADD COLUMN owner_email TEXT;

-- La unicidad ya no es global por slug, sino por (dueño, slug).
ALTER TABLE category DROP CONSTRAINT IF EXISTS category_slug_key;
ALTER TABLE category ADD CONSTRAINT category_owner_slug_key UNIQUE (owner_email, slug);

-- Gastos: dueño y NIT del establecimiento.
ALTER TABLE expense ADD COLUMN owner_email TEXT;
ALTER TABLE expense ADD COLUMN nit TEXT;

CREATE INDEX idx_expense_owner_month ON expense (owner_email, spent_on);
