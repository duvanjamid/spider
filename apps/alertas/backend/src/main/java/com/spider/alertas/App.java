package com.spider.alertas;

import com.ligero.Ligero;
import com.spider.alertas.alert.AlertController;
import com.spider.alertas.alert.AlertService;
import com.spider.alertas.alert.ReporterService;
import com.spider.alertas.config.Env;
import com.spider.alertas.db.DbConfig;
import com.spider.alertas.db.Migrations;
import com.spider.alertas.health.HealthController;
import com.spider.alertas.registry.Registry;
import org.postgresql.ds.PGSimpleDataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.sql.DataSource;

/** Punto de entrada del backend "alertas" (Ligero + Java 21). */
public final class App {
    private static final Logger log = LoggerFactory.getLogger(App.class);

    public static void main(String[] args) throws Exception {
        DbConfig db = DbConfig.fromEnv();
        Migrations.run(db);                 // nada de DDL a mano
        Registry.selfRegister();            // se da a conocer al admin

        DataSource ds = dataSource(db);
        var reporters = new ReporterService(ds);
        var alerts = new AlertService(ds, reporters);

        Ligero app = Ligero.create(Env.port());
        HealthController.register(app);
        new AlertController(alerts, reporters).register(app);

        log.info("Backend '{}' escuchando en :{} (schema '{}')",
                Env.appName(), Env.port(), db.schema());
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
