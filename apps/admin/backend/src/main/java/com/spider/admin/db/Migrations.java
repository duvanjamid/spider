package com.spider.admin.db;

import org.flywaydb.core.Flyway;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Ejecuta las migraciones Flyway de esta app al arrancar.
 *
 * <p>Principios del proyecto:
 * <ul>
 *   <li><b>Nada de DDL a mano.</b> Todo cambio de esquema es una migración
 *       versionada en {@code src/main/resources/db/migration}.</li>
 *   <li><b>Un schema por app.</b> Flyway crea y usa el schema indicado
 *       ({@code admin} en prod, {@code test_admin} en test) y su propia
 *       tabla de historial dentro de ese schema. Cero colisiones entre apps.</li>
 * </ul>
 */
public final class Migrations {

    private static final Logger log = LoggerFactory.getLogger(Migrations.class);

    private Migrations() {}

    public static void run(DbConfig db) {
        log.info("Ejecutando migraciones Flyway en schema '{}'", db.schema());
        Flyway flyway = Flyway.configure()
                .dataSource(db.jdbcUrl(), db.user(), db.password())
                .schemas(db.schema())
                .defaultSchema(db.schema())
                .createSchemas(true)
                .locations("classpath:db/migration")
                .validateMigrationNaming(true)
                .load();
        // Diagnóstico: qué migraciones ve Flyway y en qué estado.
        var infos = flyway.info().all();
        log.info("Flyway detectó {} migración(es) válidas en '{}'", infos.length, db.schema());
        for (var mi : infos) {
            log.info("  → {} | {} | {}", mi.getVersion(), mi.getScript(), mi.getState());
        }
        var result = flyway.migrate();
        log.info("Migraciones aplicadas: {} (schema '{}')",
                result.migrationsExecuted, db.schema());
    }
}
