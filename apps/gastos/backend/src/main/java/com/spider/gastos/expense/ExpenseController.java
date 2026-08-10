package com.spider.gastos.expense;

import com.ligero.Ligero;
import com.spider.gastos.ai.GeminiScanner;
import com.spider.gastos.config.Env;
import com.spider.gastos.session.Identity;

import java.util.Map;

/**
 * API de gastos (todo aislado por usuario, identificado por la cookie de sesión
 * de la plataforma; invitado si no hay sesión).
 *
 * <ul>
 *   <li>{@code GET  /categories}      → categorías del usuario (se siembran al 1er acceso).</li>
 *   <li>{@code GET  /expenses?month=} → gastos del mes.</li>
 *   <li>{@code POST /expenses}        → crea un gasto (categoría por id, NIT, fecha compra).</li>
 *   <li>{@code DELETE /expenses/{id}} → borra un gasto del usuario.</li>
 *   <li>{@code GET  /summary?month=}  → total y desglose por categoría.</li>
 *   <li>{@code GET  /trend?months=}   → serie mensual + estimación.</li>
 *   <li>{@code POST /scan}            → lee una imagen con IA (Gemini) usando las
 *       categorías del usuario; devuelve montos candidatos, NIT, etc.</li>
 *   <li>{@code GET  /ai-status}       → si la IA está configurada.</li>
 * </ul>
 */
public final class ExpenseController {

    /** Cuerpo para crear un gasto. */
    public record ExpenseInput(Double amount, String currency, Long categoryId,
                               String merchant, String description, String spentOn,
                               String nit, String source) {}

    /** Cuerpo para escanear una imagen. */
    public record ScanInput(String image, String mediaType) {}

    /** Cuerpo para crear/editar una categoría. */
    public record CategoryInput(String name, String color, String icon) {}

    /** Cuerpo para definir un presupuesto. */
    public record BudgetInput(Long categoryId, Double amount) {}

    /** Cuerpo para crear un gasto recurrente. */
    public record RecurringInput(Double amount, String currency, Long categoryId, String merchant,
                                 String description, Integer dayOfMonth) {}

    private final ExpenseService svc;
    private final CategoryService categories;
    private final BudgetService budgets;
    private final RecurringService recurring;
    private final GeminiScanner scanner;
    private final Identity identity = new Identity();

    public ExpenseController(ExpenseService svc, CategoryService categories, BudgetService budgets,
                             RecurringService recurring, GeminiScanner scanner) {
        this.svc = svc;
        this.categories = categories;
        this.budgets = budgets;
        this.recurring = recurring;
        this.scanner = scanner;
    }

    public void register(Ligero app) {
        app.get("/categories", ctx -> ctx.json(categories.ensureAndList(email(ctx.header("Cookie")))));

        app.post("/categories", ctx -> {
            String user = email(ctx.header("Cookie"));
            CategoryInput in = ctx.body(CategoryInput.class);
            if (in == null || in.name() == null || in.name().isBlank()) {
                ctx.status(400).json(Map.of("error", "nombre requerido")); return;
            }
            long id = categories.create(user, in.name(), in.color(), in.icon());
            ctx.status(201).json(Map.of("id", id));
        });

        app.put("/categories/{id}", ctx -> {
            String user = email(ctx.header("Cookie"));
            CategoryInput in = ctx.body(CategoryInput.class);
            categories.update(user, Long.parseLong(ctx.pathParam("id")),
                    in == null ? null : in.name(), in == null ? null : in.color(), in == null ? null : in.icon());
            ctx.json(Map.of("status", "updated"));
        });

        app.delete("/categories/{id}", ctx -> {
            categories.delete(email(ctx.header("Cookie")), Long.parseLong(ctx.pathParam("id")));
            ctx.json(Map.of("status", "deleted"));
        });

        app.get("/expenses", ctx ->
                ctx.json(svc.listByMonth(email(ctx.header("Cookie")), ctx.queryParam("month"))));

        app.post("/expenses", ctx -> {
            String user = email(ctx.header("Cookie"));
            ExpenseInput in = ctx.body(ExpenseInput.class);
            double amount = in == null || in.amount() == null ? 0 : in.amount();
            if (amount <= 0) { ctx.status(400).json(Map.of("error", "amount inválido")); return; }
            Long catId = categories.resolveCategoryId(user, in.categoryId(), null);
            long id = svc.create(user, amount, or(in.currency(), "COP"), catId,
                    nz(in.merchant()), nz(in.description()), in.spentOn(), nz(in.nit()),
                    or(in.source(), "manual"));
            ctx.status(201).json(Map.of("id", id));
        });

        app.delete("/expenses/{id}", ctx -> {
            svc.delete(email(ctx.header("Cookie")), Long.parseLong(ctx.pathParam("id")));
            ctx.json(Map.of("status", "deleted"));
        });

        app.get("/summary", ctx ->
                ctx.json(svc.summary(email(ctx.header("Cookie")), ctx.queryParam("month"))));

        app.get("/trend", ctx -> {
            String m = ctx.queryParam("months");
            ctx.json(svc.trend(email(ctx.header("Cookie")), m == null ? 6 : Integer.parseInt(m)));
        });

        // ── Presupuestos ──
        app.get("/budgets", ctx -> ctx.json(budgets.list(email(ctx.header("Cookie")))));
        app.put("/budgets", ctx -> {
            BudgetInput in = ctx.body(BudgetInput.class);
            if (in == null || in.categoryId() == null) { ctx.status(400).json(Map.of("error", "categoryId requerido")); return; }
            budgets.set(email(ctx.header("Cookie")), in.categoryId(), in.amount() == null ? 0 : in.amount());
            ctx.json(Map.of("status", "ok"));
        });

        // ── Recurrentes ──
        app.get("/recurring", ctx -> ctx.json(recurring.list(email(ctx.header("Cookie")))));
        app.post("/recurring", ctx -> {
            String user = email(ctx.header("Cookie"));
            RecurringInput in = ctx.body(RecurringInput.class);
            double amount = in == null || in.amount() == null ? 0 : in.amount();
            if (amount <= 0) { ctx.status(400).json(Map.of("error", "amount inválido")); return; }
            long id = recurring.create(user, amount, in.currency(),
                    categories.resolveCategoryId(user, in.categoryId(), null),
                    nz(in.merchant()), nz(in.description()), in.dayOfMonth() == null ? 1 : in.dayOfMonth());
            ctx.status(201).json(Map.of("id", id));
        });
        app.delete("/recurring/{id}", ctx -> {
            recurring.delete(email(ctx.header("Cookie")), Long.parseLong(ctx.pathParam("id")));
            ctx.json(Map.of("status", "deleted"));
        });
        app.post("/recurring/apply", ctx -> {
            int n = recurring.applyForMonth(email(ctx.header("Cookie")), ctx.queryParam("month"));
            ctx.json(Map.of("created", n));
        });

        app.get("/ai-status", ctx -> ctx.json(Map.of("enabled", Env.aiEnabled())));

        app.post("/scan", ctx -> {
            if (!Env.aiEnabled()) {
                ctx.status(503).json(Map.of("error", "IA no configurada (falta GEMINI_API_KEY)"));
                return;
            }
            String user = email(ctx.header("Cookie"));
            ScanInput in = ctx.body(ScanInput.class);
            if (in == null || in.image() == null || in.image().isBlank()) {
                ctx.status(400).json(Map.of("error", "falta 'image' (base64)"));
                return;
            }
            try {
                var cats = categories.ensureAndList(user);
                ctx.json(scanner.scan(in.image(), or(in.mediaType(), "image/jpeg"), cats));
            } catch (Exception e) {
                ctx.status(502).json(Map.of("error", "No se pudo leer la imagen: " + e.getMessage()));
            }
        });
    }

    private String email(String cookieHeader) { return identity.emailOrGuest(cookieHeader); }

    private static String or(String v, String def) { return v == null || v.isBlank() ? def : v; }
    private static String nz(String v) { return v == null ? "" : v; }
}
