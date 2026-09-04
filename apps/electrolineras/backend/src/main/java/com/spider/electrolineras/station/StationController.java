package com.spider.electrolineras.station;

import com.ligero.Ligero;
import com.spider.electrolineras.config.Env;
import com.spider.electrolineras.session.Identity;

import java.util.Map;

/**
 * API de electrolineras.
 * <ul>
 *   <li>{@code GET  /stations}              → estaciones para el mapa.</li>
 *   <li>{@code GET  /stations/{id}}         → detalle (cargadores, estado…).</li>
 *   <li>{@code GET  /stations/{id}/comments}→ comentarios.</li>
 *   <li>{@code POST /stations/{id}/comments}→ agrega comentario.</li>
 *   <li>{@code POST /stations/{id}/report}  → reporte de estado {chargerId?, status}.</li>
 *   <li>{@code GET  /stations/{id}/reports} → reportes recientes.</li>
 *   <li>{@code GET  /meta}                  → totales del catálogo.</li>
 *   <li>{@code POST /sync}                  → refresca desde datos.gov.co.</li>
 * </ul>
 */
public final class StationController {

    public record ReportInput(Long chargerId, String status) {}
    public record CommentInput(String body) {}

    private final StationService stations;
    private final ReportService reports;
    private final CommentService comments;
    private final Identity identity = new Identity();

    public StationController(StationService stations, ReportService reports, CommentService comments) {
        this.stations = stations;
        this.reports = reports;
        this.comments = comments;
    }

    public void register(Ligero app) {
        // bbox=minLat,minLon,maxLat,maxLon  → solo estaciones del área visible
        // (carga bajo demanda del mapa). Sin bbox devuelve el catálogo completo.
        app.get("/stations", ctx -> {
            Double[] b = parseBbox(ctx.queryParam("bbox"));
            int limit = parseInt(ctx.queryParam("limit"), b[0] != null ? 2000 : 0);
            ctx.json(stations.list(b[0], b[1], b[2], b[3], limit));
        });

        app.get("/stations/{id}", ctx -> {
            var d = stations.detail(Long.parseLong(ctx.pathParam("id")));
            if (d == null) { ctx.status(404).json(Map.of("error", "no existe")); return; }
            ctx.json(d);
        });

        app.get("/stations/{id}/comments", ctx ->
                ctx.json(comments.list(Long.parseLong(ctx.pathParam("id")))));

        app.post("/stations/{id}/comments", ctx -> {
            String user = email(ctx.header("Cookie"));
            long id = Long.parseLong(ctx.pathParam("id"));
            CommentInput in = ctx.body(CommentInput.class);
            if (in == null || in.body() == null || in.body().isBlank()) {
                ctx.status(400).json(Map.of("error", "comentario vacío")); return;
            }
            long cid = comments.add(user, id, in.body());
            ctx.status(201).json(Map.of("id", cid));
        });

        app.post("/stations/{id}/report", ctx -> {
            String user = email(ctx.header("Cookie"));
            long id = Long.parseLong(ctx.pathParam("id"));
            ReportInput in = ctx.body(ReportInput.class);
            if (in == null || in.status() == null) { ctx.status(400).json(Map.of("error", "status requerido")); return; }
            try {
                long rid = reports.report(user, id, in.chargerId(), in.status());
                ctx.status(201).json(Map.of("id", rid, "status", in.status()));
            } catch (IllegalArgumentException e) {
                ctx.status(400).json(Map.of("error", e.getMessage()));
            }
        });

        app.get("/stations/{id}/reports", ctx ->
                ctx.json(reports.recent(Long.parseLong(ctx.pathParam("id")), 20)));

        app.get("/meta", ctx -> {
            var m = new java.util.LinkedHashMap<String, Object>(stations.stats());
            m.put("govResource", Env.datosGovResource());
            m.put("openChargeMap", Env.openChargeMapEnabled());
            m.put("syncMinutes", Env.syncMinutes());
            ctx.json(m);
        });

        app.post("/sync", ctx -> ctx.json(Map.of("synced", stations.sync())));

        // ── Identidad del visitante (para mostrar opciones de admin) ──
        app.get("/me", ctx -> {
            String user = email(ctx.header("Cookie"));
            ctx.json(Map.of("email", user, "admin", Env.isAdmin(user)));
        });

        // ── Limpiar caché de APIs (solo admin) + resync en segundo plano ──
        app.post("/cache/clear", ctx -> {
            String user = email(ctx.header("Cookie"));
            if (!Env.isAdmin(user)) { ctx.status(403).json(Map.of("error", "solo administradores")); return; }
            int n = stations.clearCache();
            new Thread(() -> { try { stations.sync(); } catch (Exception e) { /* log interno */ } }, "sync-after-clear").start();
            ctx.json(Map.of("cleared", n, "resync", true));
        });
    }

    private String email(String cookieHeader) { return identity.emailOrGuest(cookieHeader); }

    /** "minLat,minLon,maxLat,maxLon" → [minLat,minLon,maxLat,maxLon] o nulls. */
    private static Double[] parseBbox(String s) {
        Double[] out = { null, null, null, null };
        if (s == null || s.isBlank()) return out;
        String[] p = s.split(",");
        if (p.length != 4) return out;
        try { for (int i = 0; i < 4; i++) out[i] = Double.parseDouble(p[i].trim()); }
        catch (NumberFormatException e) { return new Double[]{ null, null, null, null }; }
        return out;
    }
    private static int parseInt(String s, int def) {
        if (s == null || s.isBlank()) return def;
        try { return Integer.parseInt(s.trim()); } catch (NumberFormatException e) { return def; }
    }
}
