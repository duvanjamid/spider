package com.spider.electrolineras;

import com.ligero.Ligero;
import com.spider.electrolineras.config.Env;
import com.spider.electrolineras.db.DbConfig;
import com.spider.electrolineras.db.Migrations;
import com.spider.electrolineras.health.HealthController;
import com.spider.electrolineras.registry.Registry;
import com.spider.electrolineras.station.CommentService;
import com.spider.electrolineras.station.ReportService;
import com.spider.electrolineras.station.StationController;
import com.spider.electrolineras.station.StationService;
import org.postgresql.ds.PGSimpleDataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.sql.DataSource;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/** Punto de entrada del backend "electrolineras" (Ligero + Java 21). */
public final class App {
    private static final Logger log = LoggerFactory.getLogger(App.class);

    public static void main(String[] args) throws Exception {
        DbConfig db = DbConfig.fromEnv();
        Migrations.run(db);                 // nada de DDL a mano
        Registry.selfRegister();            // se da a conocer al admin

        DataSource ds = dataSource(db);
        var stations = new StationService(ds);
        var reports = new ReportService(ds);
        var comments = new CommentService(ds);

        // Sincronización del catálogo desde datos.gov.co (arranque + periódica).
        if (Env.syncOnStart()) {
            new Thread(() -> { try { stations.sync(); } catch (Exception e) { log.warn("Sync inicial: {}", e.getMessage()); } },
                    "sync-initial").start();
        }
        ScheduledExecutorService sched = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "sync-scheduler"); t.setDaemon(true); return t;
        });
        int mins = Math.max(Env.syncMinutes(), 15);
        sched.scheduleAtFixedRate(() -> {
            try { stations.sync(); } catch (Exception e) { log.warn("Sync periódico: {}", e.getMessage()); }
        }, mins, mins, TimeUnit.MINUTES);

        Ligero app = Ligero.create(Env.port());
        HealthController.register(app);
        new StationController(stations, reports, comments).register(app);

        log.info("Backend '{}' escuchando en :{} (schema '{}', sync cada {} min)",
                Env.appName(), Env.port(), db.schema(), mins);
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
