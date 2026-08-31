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
        app.get("/stations", ctx -> ctx.json(stations.list()));

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
    }

    private String email(String cookieHeader) { return identity.emailOrGuest(cookieHeader); }
}
