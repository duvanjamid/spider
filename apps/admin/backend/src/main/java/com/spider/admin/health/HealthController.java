package com.spider.admin.health;

import com.ligero.Ligero;
import com.spider.admin.config.Env;

import java.util.Map;

/**
 * Endpoints de salud. Render los usa para health checks del servicio.
 *
 * <p>NOTA sobre la API de Ligero: el import ({@code com.ligero.Ligero}) y
 * los métodos del contexto ({@code ctx.json/status/...}) siguen la API
 * Express-inspired de Ligero 0.5.0. Si tu versión difiere, ajusta aquí y
 * en el resto de controllers en un único punto.
 */
public final class HealthController {

    private HealthController() {}

    public static void register(Ligero app) {
        app.get("/health", ctx -> ctx.json(Map.of(
                "status", "UP",
                "app", Env.appName(),
                "schema", Env.dbSchema()
        )));
    }
}
