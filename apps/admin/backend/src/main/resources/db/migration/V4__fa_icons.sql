-- ══════════════════════════════════════════════════════════════
--  admin · V4 · iconos de apps con FontAwesome (clases FA)
--  El logo de cada app pasa de emoji a una clase FontAwesome, para
--  pintarlo con <i class="fa-solid fa-..."> en el launcher.
-- ══════════════════════════════════════════════════════════════
ALTER TABLE application ALTER COLUMN icon SET DEFAULT 'fa-solid fa-cube';

UPDATE application SET icon = 'fa-solid fa-spider' WHERE slug = 'admin';
UPDATE application SET icon = 'fa-solid fa-wallet' WHERE slug = 'gastos';

-- Cualquier app previa con emoji o vacío queda con un icono genérico FA.
UPDATE application SET icon = 'fa-solid fa-cube' WHERE icon IS NULL OR icon NOT LIKE 'fa-%';
