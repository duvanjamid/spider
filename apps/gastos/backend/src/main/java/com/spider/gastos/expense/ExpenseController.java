package com.spider.gastos.expense;

import com.ligero.Ligero;
import com.spider.gastos.ai.GeminiScanner;
import com.spider.gastos.config.Env;
import com.spider.gastos.session.Identity;

import java.util.List;
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

    /** Cuerpo para crear un gasto. spentAt = momento ISO; items = productos; shareWith = correos del hogar. */
    public record ExpenseInput(Double amount, String currency, Long categoryId,
                               String merchant, String description, String spentOn,
                               String spentAt, String nit, String source, List<ItemInput> items,
                               List<String> shareWith) {}

    /** Cuerpos de conexiones y compartición. */
    public record ConnInput(String email) {}
    public record ShareInput(List<String> emails) {}
    public record CatShareInput(String slug, List<String> emails) {}

    /** Línea de producto del gasto (opcional; suele venir del escaneo). */
    public record ItemInput(String nombre, Double cantidad, Double precioUnitario, Double total) {}

    /** Cuerpo para escanear una imagen. */
    public record ScanInput(String image, String mediaType, List<ImageInput> images) {}

    /** Una foto (base64 + tipo) cuando se envían varias de una misma factura. */
    public record ImageInput(String image, String mediaType) {}

    /** Cuerpo para escanear texto pegado. */
    public record TextScanInput(String text) {}

    /** Cuerpo del onboarding: categorías (por slug) que el usuario adopta. */
    public record OnboardingInput(List<String> slugs) {}

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
    private final ConnectionService connections;
    private final NotificationService notifications;
    private final Identity identity = new Identity();

    public ExpenseController(ExpenseService svc, CategoryService categories, BudgetService budgets,
                             RecurringService recurring, GeminiScanner scanner, ConnectionService connections,
                             NotificationService notifications) {
        this.svc = svc;
        this.categories = categories;
        this.budgets = budgets;
        this.recurring = recurring;
        this.scanner = scanner;
        this.connections = connections;
        this.notifications = notifications;
    }

    /** Filtra los correos a solo los que están conectados (aceptados) con el usuario. */
    private List<String> onlyConnected(String user, List<String> emails) {
        if (emails == null || emails.isEmpty()) return List.of();
        var fam = connections.connected(user);
        var out = new java.util.ArrayList<String>();
        for (String e : emails) {
            if (e == null) continue;
            String norm = e.trim().toLowerCase();
            for (String f : fam) if (f.equalsIgnoreCase(norm)) { out.add(f); break; }
        }
        return out;
    }

    /** Notifica una nueva compra compartida (por categoría compartida y/o gasto puntual). */
    private void notifyExpense(String user, Long catId, long expenseId, List<String> shareWith, String merchant) {
        String slug = null, name = null;
        if (catId != null) {
            String[] cat = categories.slugAndName(user, catId, null);
            if (cat != null) { slug = cat[0]; name = cat[1]; }
        }
        String label = merchant == null || merchant.isBlank() ? null : "«" + merchant + "»";
        notifications.sharedExpense(user, slug, name, expenseId, shareWith, label);
    }

    private static final String GUEST = "invitado@spider";

    public void register(Ligero app) {
        // Estado del usuario: si ya completó el onboarding y si es invitado.
        app.get("/me", ctx -> {
            Identity.Profile p = identity.profileFromCookie(ctx.header("Cookie"));
            String user = p == null ? GUEST : p.email();
            Map<String, Object> me = new java.util.LinkedHashMap<>();
            me.put("email", user);
            me.put("guest", GUEST.equals(user));
            me.put("onboarded", categories.isOnboarded(user));
            me.put("name", p == null || p.name() == null ? "" : p.name());
            me.put("picture", p == null || p.picture() == null ? "" : p.picture());
            ctx.json(me);
        });

        // Set base de categorías para elegir en el onboarding.
        app.get("/category-templates", ctx -> ctx.json(categories.templates()));

        // Adopta las categorías elegidas y marca el onboarding como hecho.
        app.post("/onboarding", ctx -> {
            String user = email(ctx.header("Cookie"));
            OnboardingInput in = ctx.body(OnboardingInput.class);
            int count = categories.adopt(user, in == null ? null : in.slugs());
            ctx.json(Map.of("status", "ok", "count", count));
        });

        app.get("/categories", ctx -> ctx.json(categories.ensureAndList(email(ctx.header("Cookie")))));
        // Categorías de miembros del hogar compartidas conmigo (solo lectura).
        app.get("/categories/shared-in", ctx -> ctx.json(categories.sharedInList(email(ctx.header("Cookie")))));

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
                    nz(in.merchant()), nz(in.description()), in.spentOn(), in.spentAt(), nz(in.nit()),
                    or(in.source(), "manual"));
            if (in.items() != null && !in.items().isEmpty()) {
                List<Map<String, Object>> items = new java.util.ArrayList<>();
                for (ItemInput it : in.items()) {
                    if (it == null || it.nombre() == null || it.nombre().isBlank()) continue;
                    Map<String, Object> m = new java.util.HashMap<>();
                    m.put("nombre", it.nombre());
                    m.put("cantidad", it.cantidad());
                    m.put("precioUnitario", it.precioUnitario());
                    m.put("total", it.total());
                    items.add(m);
                }
                svc.addItems(id, items);
            }
            if (in.shareWith() != null) svc.shareExpense(user, id, onlyConnected(user, in.shareWith()));
            notifyExpense(user, catId, id, onlyConnected(user, in.shareWith()), nz(in.merchant()));
            ctx.status(201).json(Map.of("id", id));
        });

        // Productos (líneas) de un gasto del usuario.
        app.get("/expenses/{id}/items", ctx ->
                ctx.json(svc.itemsOf(email(ctx.header("Cookie")), Long.parseLong(ctx.pathParam("id")))));

        // Comparativa de precios por producto y tienda.
        app.get("/prices", ctx -> ctx.json(svc.prices(email(ctx.header("Cookie")))));

        app.put("/expenses/{id}", ctx -> {
            String user = email(ctx.header("Cookie"));
            long id = Long.parseLong(ctx.pathParam("id"));
            ExpenseInput in = ctx.body(ExpenseInput.class);
            if (in == null) { ctx.status(400).json(Map.of("error", "cuerpo vacío")); return; }
            Long catId = in.categoryId() == null ? null : categories.resolveCategoryId(user, in.categoryId(), null);
            svc.update(user, id, in.amount(), in.currency(), catId,
                    nz(in.merchant()), nz(in.description()), in.spentOn(), in.spentAt(), nz(in.nit()));
            if (in.shareWith() != null) svc.shareExpense(user, id, onlyConnected(user, in.shareWith()));
            notifyExpense(user, catId, id, onlyConnected(user, in.shareWith()), nz(in.merchant()));
            ctx.json(Map.of("status", "updated"));
        });

        // Con quién está compartido un gasto / (re)compartir un gasto.
        app.get("/expenses/{id}/shares", ctx ->
                ctx.json(svc.sharesOfExpense(email(ctx.header("Cookie")), Long.parseLong(ctx.pathParam("id")))));
        app.put("/expenses/{id}/share", ctx -> {
            String user = email(ctx.header("Cookie"));
            long id = Long.parseLong(ctx.pathParam("id"));
            ShareInput in = ctx.body(ShareInput.class);
            svc.shareExpense(user, id, onlyConnected(user, in == null ? null : in.emails()));
            ctx.json(Map.of("status", "ok"));
        });

        app.delete("/expenses/{id}", ctx -> {
            svc.delete(email(ctx.header("Cookie")), Long.parseLong(ctx.pathParam("id")));
            ctx.json(Map.of("status", "deleted"));
        });

        // ── Compartir categorías ──
        app.get("/categories/shares", ctx -> ctx.json(svc.sharedCategories(email(ctx.header("Cookie")))));
        app.put("/categories/share", ctx -> {
            String user = email(ctx.header("Cookie"));
            CatShareInput in = ctx.body(CatShareInput.class);
            if (in == null || in.slug() == null || in.slug().isBlank()) {
                ctx.status(400).json(Map.of("error", "slug requerido")); return;
            }
            List<String> targets = onlyConnected(user, in.emails());
            svc.shareCategory(user, in.slug(), targets);
            String[] cat = categories.slugAndName(user, null, in.slug());
            notifications.categoryShared(user, targets, cat != null ? cat[1] : in.slug(), in.slug());
            ctx.json(Map.of("status", "ok"));
        });

        // ── Notificaciones in-app ──
        app.get("/notifications", ctx -> {
            String user = email(ctx.header("Cookie"));
            ctx.json(Map.of("items", notifications.list(user, 50), "unread", notifications.unreadCount(user)));
        });
        app.get("/notifications/count", ctx ->
                ctx.json(Map.of("unread", notifications.unreadCount(email(ctx.header("Cookie"))))));
        app.post("/notifications/{id}/read", ctx -> {
            notifications.markRead(email(ctx.header("Cookie")), Long.parseLong(ctx.pathParam("id")));
            ctx.json(Map.of("status", "ok"));
        });
        app.post("/notifications/read-all", ctx -> {
            notifications.markAllRead(email(ctx.header("Cookie")));
            ctx.json(Map.of("status", "ok"));
        });

        // ── Conexiones de hogar ──
        app.get("/connections", ctx -> ctx.json(connections.overview(email(ctx.header("Cookie")))));
        app.get("/household", ctx -> ctx.json(connections.connected(email(ctx.header("Cookie")))));
        app.post("/connections", ctx -> {
            String user = email(ctx.header("Cookie"));
            if (GUEST.equals(user)) { ctx.status(403).json(Map.of("error", "inicia sesión para compartir")); return; }
            ConnInput in = ctx.body(ConnInput.class);
            if (in == null || in.email() == null || in.email().isBlank()) {
                ctx.status(400).json(Map.of("error", "correo requerido")); return;
            }
            try {
                connections.invite(user, in.email());
                String other = in.email().trim().toLowerCase();
                if (connections.isConnected(user, other)) notifications.connectionAccepted(user, other);
                else notifications.connectionInvite(user, other);
                ctx.json(Map.of("status", "invited"));
            } catch (IllegalArgumentException e) { ctx.status(400).json(Map.of("error", e.getMessage())); }
        });
        app.post("/connections/{id}/accept", ctx -> {
            String user = email(ctx.header("Cookie"));
            long id = Long.parseLong(ctx.pathParam("id"));
            String partner = connections.partnerEmail(id, user);
            connections.accept(user, id);
            if (partner != null) notifications.connectionAccepted(user, partner);
            ctx.json(Map.of("status", "accepted"));
        });
        app.delete("/connections/{id}", ctx -> {
            connections.remove(email(ctx.header("Cookie")), Long.parseLong(ctx.pathParam("id")));
            ctx.json(Map.of("status", "removed"));
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
            // Acepta una imagen (image) o varias fotos de la misma factura (images, máx. 3).
            List<Map<String, Object>> imgs = new java.util.ArrayList<>();
            if (in != null && in.images() != null) {
                for (ImageInput im : in.images()) {
                    if (im == null || im.image() == null || im.image().isBlank()) continue;
                    Map<String, Object> m = new java.util.HashMap<>();
                    m.put("image", im.image());
                    m.put("mediaType", or(im.mediaType(), "image/jpeg"));
                    imgs.add(m);
                    if (imgs.size() >= 3) break;
                }
            }
            if (imgs.isEmpty() && in != null && in.image() != null && !in.image().isBlank()) {
                Map<String, Object> m = new java.util.HashMap<>();
                m.put("image", in.image());
                m.put("mediaType", or(in.mediaType(), "image/jpeg"));
                imgs.add(m);
            }
            if (imgs.isEmpty()) {
                ctx.status(400).json(Map.of("error", "falta 'image' (base64)"));
                return;
            }
            try {
                var cats = categories.ensureAndList(user);
                ctx.json(scanner.scan(imgs, cats));
            } catch (Exception e) {
                ctx.status(502).json(Map.of("error", "No se pudo leer la imagen: " + e.getMessage()));
            }
        });

        app.post("/scan-text", ctx -> {
            if (!Env.aiEnabled()) {
                ctx.status(503).json(Map.of("error", "IA no configurada (falta GEMINI_API_KEY)"));
                return;
            }
            String user = email(ctx.header("Cookie"));
            TextScanInput in = ctx.body(TextScanInput.class);
            if (in == null || in.text() == null || in.text().isBlank()) {
                ctx.status(400).json(Map.of("error", "falta 'text'"));
                return;
            }
            try {
                var cats = categories.ensureAndList(user);
                ctx.json(scanner.scanText(in.text(), cats));
            } catch (Exception e) {
                ctx.status(502).json(Map.of("error", "No se pudo leer el texto: " + e.getMessage()));
            }
        });
    }

    private String email(String cookieHeader) { return identity.emailOrGuest(cookieHeader); }

    private static String or(String v, String def) { return v == null || v.isBlank() ? def : v; }
    private static String nz(String v) { return v == null ? "" : v; }
}
