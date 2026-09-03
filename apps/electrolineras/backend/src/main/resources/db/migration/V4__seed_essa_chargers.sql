-- ══════════════════════════════════════════════════════════════
--  electrolineras · V4 · cargadores de las ecoestaciones de ESSA
--
--  La siembra V2 solo llenó el texto `connectors` de las ecoestaciones de
--  ESSA, pero NO creó filas en `charger`, que es de donde el detalle saca el
--  tipo y la potencia de cada conector. Por eso el pin aparecía sin cargadores.
--
--  Aquí se crean los cargadores por estándar. Las potencias son los valores
--  NOMINALES típicos de las ecoestaciones de ESSA (CCS2 DC de carga rápida y
--  Tipo 2 AC de carga semi-rápida); pueden ajustarse con datos oficiales sin
--  romper esquema (nueva migración). El `connectors` se sincroniza con los
--  cargadores reales para que la tarjeta y el mapa muestren lo mismo.
--
--  El JOIN por (source, external_id) evita depender del id autogenerado.
--  ON CONFLICT DO NOTHING: re-ejecutar es seguro.
-- ══════════════════════════════════════════════════════════════

INSERT INTO charger (station_id, label, connector_type, power_kw)
SELECT s.id, x.label, x.ctype, x.kw
FROM (VALUES
    ('essa-cacique',    'CCS2 (DC)',   'CCS2',   50.0),
    ('essa-cacique',    'Tipo 2 (AC)', 'Tipo 2', 22.0),
    ('essa-cra21-45',   'CCS2 (DC)',   'CCS2',   50.0),
    ('essa-cra21-45',   'Tipo 2 (AC)', 'Tipo 2', 22.0),
    ('essa-la-florida', 'Tipo 2 (AC)', 'Tipo 2', 22.0),
    ('essa-san-gil',    'Tipo 2 (AC)', 'Tipo 2', 22.0)
) AS x(ext, label, ctype, kw)
JOIN station s ON s.source = 'essa' AND s.external_id = x.ext
ON CONFLICT (station_id, label) DO NOTHING;

-- Alinea el texto `connectors` y la velocidad con los cargadores reales.
UPDATE station SET connectors = 'CCS2, Tipo 2', speed = 'Rápida'
 WHERE source = 'essa' AND external_id IN ('essa-cacique', 'essa-cra21-45');

UPDATE station SET connectors = 'Tipo 2', speed = 'Semi-rápida'
 WHERE source = 'essa' AND external_id IN ('essa-la-florida', 'essa-san-gil');
