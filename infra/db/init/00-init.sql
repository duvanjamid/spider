-- ══════════════════════════════════════════════════════════════
--  Spider · init de Postgres para DESARROLLO LOCAL únicamente.
--  (En Render la base `spider` ya existe y la gestiona el proveedor.)
--
--  Regla de oro del proyecto: NADA de cambios de esquema a mano.
--  Los SCHEMAS y TODAS las tablas los crean las migraciones SQL
--  (Flyway) de cada app al arrancar su backend. Este archivo solo
--  deja la base y el rol listos; no crea objetos de negocio.
-- ══════════════════════════════════════════════════════════════

-- La imagen oficial de postgres ya crea POSTGRES_DB/POSTGRES_USER,
-- así que aquí solo garantizamos privilegios sobre la base.
DO $$
BEGIN
  EXECUTE format('GRANT ALL ON DATABASE %I TO %I',
                 current_database(), current_user);
END $$;

-- Cada app usará su propio schema (admin, test_admin, app2, ...),
-- creado por Flyway con `flyway.createSchemas=true`. No se crean aquí.
