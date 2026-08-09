package com.spider.gastos.expense;

import com.ligero.Ligero;
import com.spider.gastos.ai.ExpenseScanner;
import com.spider.gastos.config.Env;

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
 *
 * <p>Los cuerpos JSON se deserializan con la API de Ligero {@code ctx.body(Class)}.
 */
public final class ExpenseController {

    /** Cuerpo para crear un gasto. */
    public record ExpenseInput(Double amount, String currency, String categorySlug,
                               String merchant, String description, String spentOn, String source) {}

    /** Cuerpo para escanear una imagen. */
    public record ScanInput(String image, String mediaType) {}

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
            ExpenseInput in = ctx.body(ExpenseInput.class);
            double amount = in == null || in.amount() == null ? 0 : in.amount();
            if (amount <= 0) { ctx.status(400).json(Map.of("error", "amount inválido")); return; }
            long id = svc.create(amount, or(in.currency(), "COP"), or(in.categorySlug(), "otros"),
                    nz(in.merchant()), nz(in.description()), in.spentOn(), or(in.source(), "manual"));
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
            ScanInput in = ctx.body(ScanInput.class);
            if (in == null || in.image() == null || in.image().isBlank()) {
                ctx.status(400).json(Map.of("error", "falta 'image' (base64)"));
                return;
            }
            try {
                ctx.json(scanner.scan(in.image(), or(in.mediaType(), "image/jpeg")));
            } catch (Exception e) {
                ctx.status(502).json(Map.of("error", "No se pudo leer la imagen: " + e.getMessage()));
            }
        });
    }

    private static String or(String v, String def) { return v == null || v.isBlank() ? def : v; }
    private static String nz(String v) { return v == null ? "" : v; }
}
