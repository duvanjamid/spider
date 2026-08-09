package com.spider.admin;

import com.ligero.Ligero;
import com.spider.admin.app.AppRegistryController;
import com.spider.admin.auth.AuthController;
import com.spider.admin.auth.AuthService;
import com.spider.admin.config.Env;
import com.spider.admin.db.DbConfig;
import com.spider.admin.db.Migrations;
import com.spider.admin.health.HealthController;
import org.postgresql.ds.PGSimpleDataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.sql.DataSource;

/**
 * Punto de entrada del backend admin (Ligero + Java 21 virtual threads).
 *
 * <p>Arranque:
 * <ol>
 *   <li>Resuelve la conexión a Postgres desde el entorno.</li>
 *   <li>Ejecuta migraciones Flyway sobre el schema de la app.</li>
 *   <li>Registra los controllers y levanta el servidor HTTP.</li>
 * </ol>
 */
public final class App {

    private static final Logger log = LoggerFactory.getLogger(App.class);

    public static void main(String[] args) throws Exception {
        log.info("Iniciando backend '{}' …", Env.appName());

        // 1) Configuración de BD (base única, aislamiento por schema).
        DbConfig db = DbConfig.fromEnv();

        // 2) Migraciones (nada de DDL a mano).
        Migrations.run(db);

        // 3) DataSource para los servicios.
        DataSource ds = dataSource(db);

        // 4) Servidor HTTP + rutas.
        int port = Env.port();
        Ligero app = Ligero.create(port);

        HealthController.register(app);
        new AppRegistryController(ds).register(app);
        new AuthController(new AuthService(ds, Env.get("AUTH_JWT_SECRET", "dev-secret")))
                .register(app);

        log.info("Backend '{}' escuchando en :{} (schema '{}')",
                Env.appName(), port, db.schema());
        app.start();
    }

    private static DataSource dataSource(DbConfig db) {
        PGSimpleDataSource ds = new PGSimpleDataSource();
        ds.setUrl(db.jdbcUrl());
        ds.setUser(db.user());
        ds.setPassword(db.password());
        ds.setCurrentSchema(db.schema());
        return ds;
    }

    private App() {}
}
