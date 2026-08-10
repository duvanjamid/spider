package com.spider.gastos;

import com.ligero.Ligero;
import com.spider.gastos.ai.GeminiScanner;
import com.spider.gastos.config.Env;
import com.spider.gastos.db.DbConfig;
import com.spider.gastos.db.Migrations;
import com.spider.gastos.expense.CategoryService;
import com.spider.gastos.expense.ExpenseController;
import com.spider.gastos.expense.ExpenseService;
import com.spider.gastos.health.HealthController;
import com.spider.gastos.registry.Registry;
import org.postgresql.ds.PGSimpleDataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.sql.DataSource;

/** Punto de entrada del backend "gastos" (Ligero + Java 21). */
public final class App {
    private static final Logger log = LoggerFactory.getLogger(App.class);

    public static void main(String[] args) throws Exception {
        DbConfig db = DbConfig.fromEnv();
        Migrations.run(db);                 // nada de DDL a mano
        Registry.selfRegister();            // se da a conocer al admin

        DataSource ds = dataSource(db);
        var expenses = new ExpenseService(ds);
        var categories = new CategoryService(ds);
        var scanner = new GeminiScanner();

        Ligero app = Ligero.create(Env.port());
        HealthController.register(app);
        new ExpenseController(expenses, categories, scanner).register(app);

        log.info("Backend '{}' escuchando en :{} (schema '{}', IA={})",
                Env.appName(), Env.port(), db.schema(), Env.aiEnabled());
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
