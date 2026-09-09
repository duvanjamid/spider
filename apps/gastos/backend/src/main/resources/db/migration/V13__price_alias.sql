-- Agrupación MANUAL de productos para la comparación de precios.
-- La normalización automática deja algunos productos separados que en realidad
-- son el mismo (p.ej. «manzanas» y «manzanas paquete»). Cada usuario puede unir
-- productos bajo un grupo con nombre propio; los que no agrupa siguen igual.
--
-- name_norm  = nombre normalizado del producto original (como en expense_item)
-- group_norm = clave normalizada del grupo elegido
-- group_name = nombre visible del grupo
CREATE TABLE price_alias (
    owner_email TEXT NOT NULL,
    name_norm   TEXT NOT NULL,
    group_norm  TEXT NOT NULL,
    group_name  TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (owner_email, name_norm)
);

CREATE INDEX idx_price_alias_group ON price_alias (owner_email, group_norm);
