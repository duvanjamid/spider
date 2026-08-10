-- ══════════════════════════════════════════════════════════════
--  admin · V3 · branding de cada app (logo + color base)
--  Para pintar cards bonitas en el launcher: cada app expone un
--  emoji como logo y un color base. Sin prefijo de schema (Flyway).
-- ══════════════════════════════════════════════════════════════
ALTER TABLE application ADD COLUMN IF NOT EXISTS icon  TEXT NOT NULL DEFAULT '🧩';
ALTER TABLE application ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '#6c8cff';

-- Branding de las apps conocidas (idempotente).
UPDATE application SET icon = '🕷️', color = '#6c8cff' WHERE slug = 'admin';
UPDATE application SET icon = '💸', color = '#10b981' WHERE slug = 'gastos';
