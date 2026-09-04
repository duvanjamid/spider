package com.spider.electrolineras.route;

import com.ligero.Ligero;

import java.util.Map;

/** Endpoints de geocodificación y ruteo (para el planeador de viajes). */
public final class RouteController {

    private final RoutingService routing;

    public RouteController(RoutingService routing) { this.routing = routing; }

    public void register(Ligero app) {
        app.get("/geocode", ctx -> {
            String q = ctx.queryParam("q");
            if (q == null || q.isBlank()) { ctx.status(400).json(Map.of("error", "q requerido")); return; }
            ctx.json(routing.geocode(q.trim()));
        });

        app.get("/route", ctx -> {
            double[] from = parse(ctx.queryParam("from"));
            double[] to = parse(ctx.queryParam("to"));
            if (from == null || to == null) { ctx.status(400).json(Map.of("error", "from y to = 'lat,lon'")); return; }
            ctx.json(routing.route(from[0], from[1], to[0], to[1]));
        });

        // Varias rutas alternativas (para elegir la mejor según cargadores).
        app.get("/routes", ctx -> {
            double[] from = parse(ctx.queryParam("from"));
            double[] to = parse(ctx.queryParam("to"));
            if (from == null || to == null) { ctx.status(400).json(Map.of("error", "from y to = 'lat,lon'")); return; }
            ctx.json(routing.routes(from[0], from[1], to[0], to[1]));
        });
    }

    private static double[] parse(String s) {
        if (s == null || !s.contains(",")) return null;
        try {
            String[] p = s.split(",", 2);
            return new double[]{ Double.parseDouble(p[0].trim()), Double.parseDouble(p[1].trim()) };
        } catch (Exception e) { return null; }
    }
}
