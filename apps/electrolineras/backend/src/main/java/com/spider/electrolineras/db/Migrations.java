package com.spider.electrolineras.db;

import org.flywaydb.core.Flyway;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Ejecuta migraciones Flyway sobre el schema de la app (un schema por app). */
public final class Migrations {
    private static final Logger log = LoggerFactory.getLogger(Migrations.class);
    private Migrations() {}
    public static void run(DbConfig db) {
        Flyway flyway = Flyway.configure()
                .dataSource(db.jdbcUrl(), db.user(), db.password())
                .schemas(db.schema())
                .defaultSchema(db.schema())
                .createSchemas(true)
                .locations("classpath:db/migration")
                .validateMigrationNaming(true)
                .load();
        var r = flyway.migrate();
        log.info("Migraciones aplicadas: {} (schema '{}')", r.migrationsExecuted, db.schema());
    }
}
