-- ══════════════════════════════════════════════════════════════
--  gastos · V5 · iconos de categoría con FontAwesome
--  Los iconos pasan de PrimeIcons (pi-*) a clases FontAwesome, tanto en
--  las plantillas base (owner_email NULL) como en las copias de cada
--  usuario. Se mapea por slug; lo demás recibe un icono genérico FA.
-- ══════════════════════════════════════════════════════════════
UPDATE category SET icon = CASE slug
    WHEN 'comida'     THEN 'fa-solid fa-utensils'
    WHEN 'transporte' THEN 'fa-solid fa-car'
    WHEN 'mercado'    THEN 'fa-solid fa-basket-shopping'
    WHEN 'servicios'  THEN 'fa-solid fa-bolt'
    WHEN 'ocio'       THEN 'fa-solid fa-ticket'
    WHEN 'salud'      THEN 'fa-solid fa-heart-pulse'
    WHEN 'hogar'      THEN 'fa-solid fa-house'
    WHEN 'otros'      THEN 'fa-solid fa-ellipsis'
    ELSE icon
END
WHERE slug IN ('comida','transporte','mercado','servicios','ocio','salud','hogar','otros');

-- Cualquier icono que siga en formato PrimeIcons pasa a genérico FA.
UPDATE category SET icon = 'fa-solid fa-wallet' WHERE icon LIKE 'pi-%' OR icon LIKE 'pi %';

ALTER TABLE category ALTER COLUMN icon SET DEFAULT 'fa-solid fa-wallet';
