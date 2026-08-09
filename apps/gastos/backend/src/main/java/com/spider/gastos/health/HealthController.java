package com.spider.gastos.health;

import com.ligero.Ligero;
import com.spider.gastos.config.Env;
import java.util.Map;

/** Health check (usado por Render). */
public final class HealthController {
    private HealthController() {}
    public static void register(Ligero app) {
        app.get("/health", ctx -> ctx.json(Map.of(
                "status", "UP", "app", Env.appName(), "schema", Env.dbSchema())));
    }
}
