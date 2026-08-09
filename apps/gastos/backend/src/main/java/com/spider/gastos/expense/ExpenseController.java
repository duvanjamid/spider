package com.spider.gastos.expense;

import com.fasterxml.jackson.databind.JsonNode;
import com.ligero.Ligero;
import com.spider.gastos.ai.ExpenseScanner;
import com.spider.gastos.config.Env;
import com.spider.gastos.util.Json;

import java.util.Map;

/**
 * API de gastos.
 * <ul>
 *   <li>{@code GET  /categories}      → categorías.</li>
 *   <li>{@code GET  /expenses?month=} → gastos del mes (por defecto, el actual).</li>
 *   <li>{@code POST /expenses}        → crea un gasto (JSON).</li>
 *   <li>{@code DELETE /expenses/{id}} → borra un gasto.</li>
 *   <li>{@code GET  /summary?month=}  → total y desglose por categoría.</li>
 *   <li>{@code GET  /trend?months=}   → serie mensual + estimación.</li>
 *   <li>{@code POST /scan}            → extrae un gasto de una imagen con IA.</li>
 *   <li>{@code GET  /ai-status}       → si la IA está configurada.</li>
 * </ul>
 */
public final class ExpenseController {

    private final ExpenseService svc;
    private final ExpenseScanner scanner;

    public ExpenseController(ExpenseService svc, ExpenseScanner scanner) {
        this.svc = svc;
        this.scanner = scanner;
    }

    public void register(Ligero app) {
        app.get("/categories", ctx -> ctx.json(svc.categories()));

        app.get("/expenses", ctx -> ctx.json(svc.listByMonth(ctx.queryParam("month"))));

        app.post("/expenses", ctx -> {
            JsonNode b = Json.MAPPER.readTree(ctx.body());
            double amount = b.path("amount").asDouble(0);
            if (amount <= 0) { ctx.status(400).json(Map.of("error", "amount inválido")); return; }
            long id = svc.create(
                    amount,
                    text(b, "currency", "COP"),
                    text(b, "categorySlug", "otros"),
                    text(b, "merchant", ""),
                    text(b, "description", ""),
                    text(b, "spentOn", null),
                    text(b, "source", "manual"));
            ctx.status(201).json(Map.of("id", id));
        });

        app.delete("/expenses/{id}", ctx -> {
            svc.delete(Long.parseLong(ctx.pathParam("id")));
            ctx.json(Map.of("status", "deleted"));
        });

        app.get("/summary", ctx -> ctx.json(svc.summary(ctx.queryParam("month"))));

        app.get("/trend", ctx -> {
            String m = ctx.queryParam("months");
            ctx.json(svc.trend(m == null ? 6 : Integer.parseInt(m)));
        });

        app.get("/ai-status", ctx -> ctx.json(Map.of("enabled", Env.aiEnabled())));

        app.post("/scan", ctx -> {
            if (!Env.aiEnabled()) {
                ctx.status(503).json(Map.of("error", "IA no configurada (falta ANTHROPIC_API_KEY)"));
                return;
            }
            JsonNode b = Json.MAPPER.readTree(ctx.body());
            String image = text(b, "image", "");
            if (image.isBlank()) { ctx.status(400).json(Map.of("error", "falta 'image' (base64)")); return; }
            try {
                ctx.json(scanner.scan(image, text(b, "mediaType", "image/jpeg")));
            } catch (Exception e) {
                ctx.status(502).json(Map.of("error", "No se pudo leer la imagen: " + e.getMessage()));
            }
        });
    }

    private static String text(JsonNode n, String field, String def) {
        JsonNode v = n.path(field);
        return v.isMissingNode() || v.isNull() ? def : v.asText();
    }
}
