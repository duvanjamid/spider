package com.spider.alertas.alert;

import com.ligero.Ligero;
import com.spider.alertas.session.Identity;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * API de alertas colaborativas.
 * <ul>
 *   <li>{@code GET  /categories}          → catálogo de tipos con radio/severidad.</li>
 *   <li>{@code GET  /me}                  → mi identidad seudónima y reputación.</li>
 *   <li>{@code GET  /me/alerts}           → mis reportes.</li>
 *   <li>{@code GET  /alerts?lat&lon&km}   → alertas activas cerca (por distancia).</li>
 *   <li>{@code POST /alerts}              → crear reporte {category, description?, photo?, lat, lon}.</li>
 *   <li>{@code GET  /alerts/{id}}         → detalle.</li>
 *   <li>{@code POST /alerts/{id}/vote}    → confirmar/desmentir {vote, lat, lon} (geo-restringido).</li>
 *   <li>{@code POST /alerts/{id}/safe}    → "estoy a salvo" {lat?, lon?}.</li>
 *   <li>{@code POST /alerts/{id}/resolve} → el autor cierra el reporte.</li>
 * </ul>
 */
public final class AlertController {

    public record VoteInput(String vote, Double lat, Double lon) {}
    public record SafeInput(Double lat, Double lon) {}

    private final AlertService alerts;
    private final ReporterService reporters;
    private final Identity identity = new Identity();

    public AlertController(AlertService alerts, ReporterService reporters) {
        this.alerts = alerts;
        this.reporters = reporters;
    }

    public void register(Ligero app) {
        app.get("/categories", ctx -> ctx.json(Categories.all()));

        app.get("/me", ctx -> ctx.json(reporters.ensure(email(ctx.header("Cookie")))));

        app.get("/me/alerts", ctx -> ctx.json(alerts.mine(email(ctx.header("Cookie")))));

        app.get("/alerts", ctx -> {
            Double lat = num(ctx.queryParam("lat")), lon = num(ctx.queryParam("lon"));
            double km = lat == null ? 0 : opt(num(ctx.queryParam("km")), 60);
            if (lat == null || lon == null) { ctx.json(alerts.nearby(4.6, -74.08, 0)); return; } // Bogotá por defecto
            ctx.json(alerts.nearby(lat, lon, km));
        });

        app.post("/alerts", ctx -> {
            String user = email(ctx.header("Cookie"));
            AlertService.NewAlert in = ctx.body(AlertService.NewAlert.class);
            try {
                ctx.status(201).json(alerts.create(user, in));
            } catch (IllegalArgumentException e) {
                ctx.status(400).json(Map.of("error", e.getMessage()));
            }
        });

        app.get("/alerts/{id}", ctx -> {
            var d = alerts.detail(Long.parseLong(ctx.pathParam("id")), email(ctx.header("Cookie")));
            if (d == null) { ctx.status(404).json(Map.of("error", "no existe")); return; }
            ctx.json(d);
        });

        app.post("/alerts/{id}/vote", ctx -> {
            String user = email(ctx.header("Cookie"));
            long id = Long.parseLong(ctx.pathParam("id"));
            VoteInput in = ctx.body(VoteInput.class);
            if (in == null) { ctx.status(400).json(Map.of("error", "voto requerido")); return; }
            try {
                ctx.json(alerts.vote(id, user, in.vote(), in.lat(), in.lon()));
            } catch (IllegalArgumentException e) {
                ctx.status(400).json(Map.of("error", e.getMessage()));
            }
        });

        app.post("/alerts/{id}/safe", ctx -> {
            String user = email(ctx.header("Cookie"));
            long id = Long.parseLong(ctx.pathParam("id"));
            SafeInput in = ctx.body(SafeInput.class);
            Double lat = in == null ? null : in.lat();
            Double lon = in == null ? null : in.lon();
            ctx.json(alerts.markSafe(id, user, lat, lon));
        });

        app.post("/alerts/{id}/resolve", ctx -> {
            String user = email(ctx.header("Cookie"));
            long id = Long.parseLong(ctx.pathParam("id"));
            try {
                ctx.json(alerts.resolve(id, user));
            } catch (IllegalArgumentException e) {
                ctx.status(400).json(Map.of("error", e.getMessage()));
            }
        });
    }

    private String email(String cookieHeader) { return identity.emailOrGuest(cookieHeader); }

    private static Double num(String s) {
        if (s == null || s.isBlank()) return null;
        try { return Double.parseDouble(s.trim()); } catch (NumberFormatException e) { return null; }
    }
    private static double opt(Double v, double d) { return v == null ? d : v; }
}
