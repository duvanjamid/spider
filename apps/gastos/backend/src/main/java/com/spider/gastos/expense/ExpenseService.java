package com.spider.gastos.expense;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Gastos por usuario (owner_email). Devuelve estructuras JSON-friendly. */
public class ExpenseService {

    private final DataSource ds;

    public ExpenseService(DataSource ds) {
        this.ds = ds;
    }

    /**
     * Condición SQL de visibilidad por ámbito (alias {@code e} para expense):
     *  - "mine": mis movimientos marcados 'mine' (1 parámetro, el correo).
     *  - "home": movimientos 'home' de cualquier miembro del hogar —yo + mis
     *    conexiones aceptadas— (4 parámetros, todos el correo).
     */
    static String visible(String scope) {
        if ("home".equals(scope)) {
            return "( e.scope = 'home' AND e.owner_email IN ("
                    + " SELECT ? UNION SELECT CASE WHEN requester_email = ? THEN addressee_email ELSE requester_email END"
                    + " FROM connection WHERE status = 'accepted' AND (requester_email = ? OR addressee_email = ?) ) )";
        }
        return "( e.owner_email = ? AND e.scope = 'mine' )";
    }
    private static int bindVisible(PreparedStatement ps, int from, String email, String scope) throws java.sql.SQLException {
        int n = "home".equals(scope) ? 4 : 1;
        for (int i = 0; i < n; i++) ps.setString(from + i, email);
        return from + n;
    }

    /** Visibilidad "cualquiera": míos (todo scope) + del hogar marcados 'home'. 4 parámetros. */
    static final String VISIBLE_ANY = """
            ( e.owner_email = ?
              OR ( e.scope = 'home' AND e.owner_email IN (
                     SELECT CASE WHEN requester_email = ? THEN addressee_email ELSE requester_email END
                     FROM connection WHERE status = 'accepted' AND (requester_email = ? OR addressee_email = ?) ) ) )
            """;
    private static int bindAny(PreparedStatement ps, int from, String email) throws java.sql.SQLException {
        for (int i = 0; i < 4; i++) ps.setString(from + i, email);
        return from + 4;
    }
    private static String norm(String scope) { return "home".equals(scope) ? "home" : "mine"; }

    /** Gastos de un usuario en un mes ("YYYY-MM"; null = mes actual), por ámbito mine|home. */
    public List<Map<String, Object>> listByMonth(String email, String month, String scope) {
        String sc = norm(scope);
        String ym = month == null || month.isBlank() ? YearMonth.now().toString() : month;
        String sql = "SELECT e.id, e.amount, e.currency, e.merchant, e.description, e.nit, e.owner_email AS owner, e.scope, "
                + "e.spent_on, COALESCE(e.spent_at, e.spent_on::timestamptz) AS spent_at, e.created_at, e.source, "
                + "c.slug AS cat_slug, c.name AS cat_name, c.color AS cat_color, "
                + "(SELECT COALESCE(SUM(amount),0) FROM expense_tax WHERE expense_id = e.id) AS tax_total "
                + "FROM expense e LEFT JOIN category c ON c.id = e.category_id "
                + "WHERE " + visible(sc) + " AND to_char(e.spent_on, 'YYYY-MM') = ? "
                + "ORDER BY COALESCE(e.spent_at, e.spent_on::timestamptz) DESC, e.id DESC";
        List<Map<String, Object>> out = new ArrayList<>();
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            int i = bindVisible(ps, 1, email, sc);
            ps.setString(i, ym);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", rs.getLong("id"));
                    m.put("amount", rs.getBigDecimal("amount").doubleValue());
                    m.put("currency", rs.getString("currency"));
                    m.put("merchant", nz(rs.getString("merchant")));
                    m.put("description", nz(rs.getString("description")));
                    m.put("nit", nz(rs.getString("nit")));
                    m.put("spentOn", rs.getString("spent_on"));
                    m.put("spentAt", String.valueOf(rs.getObject("spent_at")));
                    m.put("registeredAt", String.valueOf(rs.getObject("created_at")));
                    m.put("source", rs.getString("source"));
                    m.put("categorySlug", nz(rs.getString("cat_slug")));
                    m.put("categoryName", nz(rs.getString("cat_name")));
                    m.put("categoryColor", nz(rs.getString("cat_color")));
                    String owner = rs.getString("owner");
                    boolean mine = owner != null && owner.equalsIgnoreCase(email);
                    m.put("scope", rs.getString("scope"));
                    m.put("mine", mine);
                    m.put("by", mine ? "" : nz(owner));   // quién lo registró (vista hogar)
                    m.put("canEdit", mine);               // solo el creador edita/borra
                    m.put("taxTotal", rs.getBigDecimal("tax_total") == null ? 0.0 : rs.getBigDecimal("tax_total").doubleValue());
                    out.add(m);
                }
            }
        } catch (Exception e) { throw new RuntimeException("Error listando gastos", e); }
        return out;
    }

    public long create(String email, double amount, String currency, Long categoryId, String merchant,
                       String description, String spentOn, String spentAt, String nit, String source, String scope) {
        LocalDate day = spentOn == null || spentOn.isBlank() ? LocalDate.now() : LocalDate.parse(spentOn);
        java.time.LocalDateTime moment = parseMoment(spentAt, day);
        String sql = """
                INSERT INTO expense (owner_email, amount, currency, category_id, merchant, description,
                                     spent_on, spent_at, nit, source, scope)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id
                """;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, email);
            ps.setDouble(2, amount);
            ps.setString(3, currency == null || currency.isBlank() ? "COP" : currency);
            ps.setObject(4, categoryId);
            ps.setString(5, merchant);
            ps.setString(6, description);
            ps.setObject(7, day);
            ps.setObject(8, moment);
            ps.setString(9, nit);
            ps.setString(10, source == null || source.isBlank() ? "manual" : source);
            ps.setString(11, norm(scope));
            try (ResultSet rs = ps.executeQuery()) { rs.next(); return rs.getLong(1); }
        } catch (Exception e) { throw new RuntimeException("Error creando gasto", e); }
    }

    /** Momento de compra: ISO "YYYY-MM-DDTHH:mm" si viene; si no, medianoche del día. */
    private static java.time.LocalDateTime parseMoment(String spentAt, LocalDate day) {
        if (spentAt != null && !spentAt.isBlank()) {
            try { return java.time.LocalDateTime.parse(spentAt.trim().length() == 16 ? spentAt.trim() : spentAt.trim().substring(0, 16)); }
            catch (Exception ignore) { /* cae a medianoche */ }
        }
        return day.atStartOfDay();
    }

    /** Edita un gasto del usuario. categoryId se asigna tal cual (null = sin categoría). */
    public void update(String email, long id, Double amount, String currency, Long categoryId,
                       String merchant, String description, String spentOn, String spentAt, String nit, String scope) {
        LocalDate day = spentOn == null || spentOn.isBlank() ? null : LocalDate.parse(spentOn);
        java.time.LocalDateTime moment = spentAt == null || spentAt.isBlank() ? null : parseMoment(spentAt, day == null ? LocalDate.now() : day);
        String sql = """
                UPDATE expense SET
                    amount      = COALESCE(?, amount),
                    currency    = COALESCE(?, currency),
                    category_id = ?,
                    merchant    = ?,
                    description = ?,
                    nit         = ?,
                    spent_on    = COALESCE(?, spent_on),
                    spent_at    = COALESCE(?, spent_at),
                    scope       = COALESCE(?, scope)
                WHERE id = ? AND owner_email = ?
                """;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            if (amount == null) ps.setNull(1, java.sql.Types.NUMERIC); else ps.setDouble(1, amount);
            ps.setString(2, currency == null || currency.isBlank() ? null : currency);
            ps.setObject(3, categoryId);
            ps.setString(4, merchant);
            ps.setString(5, description);
            ps.setString(6, nit);
            ps.setObject(7, day);
            ps.setObject(8, moment);
            ps.setString(9, scope == null || scope.isBlank() ? null : norm(scope));
            ps.setLong(10, id);
            ps.setString(11, email);
            ps.executeUpdate();
        } catch (Exception e) { throw new RuntimeException("Error editando gasto", e); }
    }

    public void delete(String email, long id) {
        try (Connection c = ds.getConnection();
             PreparedStatement ps = c.prepareStatement("DELETE FROM expense WHERE id = ? AND owner_email = ?")) {
            ps.setLong(1, id);
            ps.setString(2, email);
            ps.executeUpdate();
        } catch (Exception e) { throw new RuntimeException("Error borrando gasto", e); }
    }

    public Map<String, Object> summary(String email, String month, String scope) {
        String sc = norm(scope);
        boolean home = "home".equals(sc);
        String ym = month == null || month.isBlank() ? YearMonth.now().toString() : month;
        // Hogar: se agrupa por NOMBRE de categoría (cada miembro tiene sus propias
        // categorías, se combinan por nombre). Mío: por categoría propia (slug).
        String sql = home
                ? "SELECT COALESCE(c.name,'Otros') AS name, MAX(COALESCE(c.color,'#9aa3b2')) AS color, "
                  + "SUM(e.amount) AS total FROM expense e LEFT JOIN category c ON c.id = e.category_id "
                  + "WHERE " + visible(sc) + " AND to_char(e.spent_on,'YYYY-MM') = ? "
                  + "GROUP BY COALESCE(c.name,'Otros') ORDER BY total DESC"
                : "SELECT COALESCE(c.slug,'otros') AS slug, COALESCE(c.name,'Otros') AS name, "
                  + "COALESCE(c.color,'#9aa3b2') AS color, SUM(e.amount) AS total, MAX(b.amount) AS budget "
                  + "FROM expense e LEFT JOIN category c ON c.id = e.category_id "
                  + "LEFT JOIN budget b ON b.category_id = c.id AND b.owner_email = ? "
                  + "WHERE " + visible(sc) + " AND to_char(e.spent_on, 'YYYY-MM') = ? "
                  + "GROUP BY c.slug, c.name, c.color ORDER BY total DESC";
        List<Map<String, Object>> byCat = new ArrayList<>();
        double total = 0;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            int i = home ? bindVisible(ps, 1, email, sc) : bindVisible(ps, 2, email, sc);
            if (!home) ps.setString(1, email);   // presupuesto propio (solo vista mía)
            ps.setString(i, ym);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    double t = rs.getBigDecimal("total").doubleValue();
                    total += t;
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("slug", home ? rs.getString("name") : rs.getString("slug"));
                    row.put("name", rs.getString("name"));
                    row.put("color", rs.getString("color"));
                    row.put("total", t);
                    row.put("budget", home ? 0.0 : (rs.getBigDecimal("budget") == null ? 0.0 : rs.getBigDecimal("budget").doubleValue()));
                    byCat.add(row);
                }
            }
        } catch (Exception e) { throw new RuntimeException("Error en resumen", e); }

        // ── Estadísticas y proyección ──
        YearMonth month2 = YearMonth.parse(ym);
        YearMonth current = YearMonth.now();
        int daysInMonth = month2.lengthOfMonth();
        int daysElapsed = month2.isBefore(current) ? daysInMonth
                : month2.isAfter(current) ? 0 : LocalDate.now().getDayOfMonth();
        double dailyAvg = daysElapsed > 0 ? total / daysElapsed : 0;
        double projected = month2.equals(current) ? dailyAvg * daysInMonth : total;
        int count = countExpenses(email, ym, sc);
        double prev = monthTotal(email, month2.minusMonths(1).toString(), sc);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("month", ym);
        out.put("scope", sc);
        out.put("total", total);
        out.put("byCategory", byCat);
        if (home) out.put("byMember", byMember(email, ym));   // desglose por miembro (hogar)
        out.put("count", count);
        out.put("daysInMonth", daysInMonth);
        out.put("daysElapsed", daysElapsed);
        out.put("dailyAverage", dailyAvg);
        out.put("projectedEndOfMonth", projected);
        out.put("previousMonthTotal", prev);
        return out;
    }

    /** Gasto del hogar por miembro (correo → total) en el mes. */
    private List<Map<String, Object>> byMember(String email, String ym) {
        String sql = "SELECT e.owner_email AS m, SUM(e.amount) AS total FROM expense e WHERE "
                + visible("home") + " AND to_char(e.spent_on,'YYYY-MM') = ? GROUP BY e.owner_email ORDER BY total DESC";
        List<Map<String, Object>> out = new ArrayList<>();
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            int i = bindVisible(ps, 1, email, "home"); ps.setString(i, ym);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) out.add(Map.of("email", nz(rs.getString("m")), "total", rs.getBigDecimal("total").doubleValue()));
            }
        } catch (Exception e) { return out; }
        return out;
    }

    private int countExpenses(String email, String ym, String scope) {
        String sql = "SELECT COUNT(*) FROM expense e WHERE " + visible(scope) + " AND to_char(e.spent_on,'YYYY-MM') = ?";
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            int i = bindVisible(ps, 1, email, scope); ps.setString(i, ym);
            try (ResultSet rs = ps.executeQuery()) { rs.next(); return rs.getInt(1); }
        } catch (Exception e) { return 0; }
    }

    private double monthTotal(String email, String ym, String scope) {
        String sql = "SELECT COALESCE(SUM(e.amount),0) FROM expense e WHERE " + visible(scope) + " AND to_char(e.spent_on,'YYYY-MM') = ?";
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            int i = bindVisible(ps, 1, email, scope); ps.setString(i, ym);
            try (ResultSet rs = ps.executeQuery()) { rs.next(); return rs.getBigDecimal(1).doubleValue(); }
        } catch (Exception e) { return 0; }
    }

    public Map<String, Object> trend(String email, int months, String scope) {
        String sc = norm(scope);
        int n = months <= 0 ? 6 : Math.min(months, 24);
        String sql = "SELECT to_char(date_trunc('month', e.spent_on), 'YYYY-MM') AS ym, SUM(e.amount) AS total "
                + "FROM expense e WHERE " + visible(sc)
                + " AND e.spent_on >= (date_trunc('month', current_date) - make_interval(months => ?)) "
                + "GROUP BY 1 ORDER BY 1";
        Map<String, Double> totals = new LinkedHashMap<>();
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            int i = bindVisible(ps, 1, email, sc);
            ps.setInt(i, n - 1);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) totals.put(rs.getString("ym"), rs.getBigDecimal("total").doubleValue());
            }
        } catch (Exception e) { throw new RuntimeException("Error en tendencia", e); }

        List<Map<String, Object>> series = new ArrayList<>();
        YearMonth start = YearMonth.now().minusMonths(n - 1L);
        double sum = 0;
        for (int i = 0; i < n; i++) {
            String ym = start.plusMonths(i).toString();
            double t = totals.getOrDefault(ym, 0.0);
            series.add(Map.of("month", ym, "total", t));
            sum += t;
        }
        double forecast = series.isEmpty() ? 0 : weightedForecast(series);
        return Map.of("series", series, "forecastNext", forecast, "average", sum / n);
    }

    private static double weightedForecast(List<Map<String, Object>> series) {
        double num = 0, den = 0;
        for (int i = 0; i < series.size(); i++) {
            double w = i + 1;
            num += w * (double) series.get(i).get("total");
            den += w;
        }
        return den == 0 ? 0 : num / den;
    }

    /**
     * Detector de «gastos hormiga»: compras pequeñas (≤ {@code maxAmount}) que se
     * repiten (≥ 2 veces) en el mes y, sumadas, pesan. Agrupa por comercio (o
     * descripción/categoría) sobre los gastos propios del usuario.
     */
    public Map<String, Object> antExpenses(String email, String month, double maxAmount, String scope) {
        String sc = norm(scope);
        String ym = month == null || month.isBlank() ? YearMonth.now().toString() : month;
        double cap = maxAmount > 0 ? maxAmount : 40000;   // ~10 USD: umbral de «compra pequeña» por defecto
        String sql = "SELECT lower(coalesce(nullif(trim(e.merchant),''), nullif(trim(e.description),''), c.name, 'otros')) AS gkey, "
                + "max(coalesce(nullif(trim(e.merchant),''), nullif(trim(e.description),''), c.name, 'Otros')) AS label, "
                + "max(coalesce(c.color, '#9aa3b2')) AS color, count(*) AS n, sum(e.amount) AS total, avg(e.amount) AS avg "
                + "FROM expense e LEFT JOIN category c ON c.id = e.category_id "
                + "WHERE " + visible(sc) + " AND to_char(e.spent_on,'YYYY-MM') = ? AND e.amount <= ? "
                + "GROUP BY gkey HAVING count(*) >= 2 ORDER BY sum(e.amount) DESC";
        List<Map<String, Object>> groups = new ArrayList<>();
        double total = 0;
        int count = 0;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            int i = bindVisible(ps, 1, email, sc); ps.setString(i, ym); ps.setDouble(i + 1, cap);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    double t = rs.getBigDecimal("total").doubleValue();
                    int n = rs.getInt("n");
                    total += t; count += n;
                    if (groups.size() < 12) {
                        Map<String, Object> m = new LinkedHashMap<>();
                        m.put("label", rs.getString("label"));
                        m.put("color", rs.getString("color"));
                        m.put("count", n);
                        m.put("total", t);
                        m.put("avg", rs.getBigDecimal("avg").doubleValue());
                        groups.add(m);
                    }
                }
            }
        } catch (Exception e) { throw new RuntimeException("Error detectando gastos hormiga", e); }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("month", ym);
        out.put("threshold", cap);
        out.put("total", total);
        out.put("count", count);
        out.put("groups", groups);
        return out;
    }

    /** Acumulado de gasto por día del mes (para la curva de «quema» del presupuesto). */
    public List<Map<String, Object>> dailyCumulative(String email, String month, String scope) {
        String sc = norm(scope);
        String ym = month == null || month.isBlank() ? YearMonth.now().toString() : month;
        String sql = "SELECT EXTRACT(DAY FROM e.spent_on)::int AS d, SUM(e.amount) AS total "
                + "FROM expense e WHERE " + visible(sc) + " AND to_char(e.spent_on,'YYYY-MM') = ? GROUP BY d ORDER BY d";
        int days = YearMonth.parse(ym).lengthOfMonth();
        double[] perDay = new double[days + 1];
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            int i = bindVisible(ps, 1, email, sc); ps.setString(i, ym);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    int d = rs.getInt("d");
                    if (d >= 1 && d <= days) perDay[d] = rs.getBigDecimal("total").doubleValue();
                }
            }
        } catch (Exception e) { throw new RuntimeException("Error calculando acumulado diario", e); }
        List<Map<String, Object>> out = new ArrayList<>();
        double acc = 0;
        for (int d = 1; d <= days; d++) {
            acc += perDay[d];
            out.add(Map.of("day", d, "cumulative", acc));
        }
        return out;
    }

    // ══════════════ Productos de la factura (detalle) ══════════════

    /** Guarda las líneas de producto de un gasto (nombre, cantidad, precio unitario, total). */
    public void addItems(long expenseId, List<Map<String, Object>> items) {
        if (items == null || items.isEmpty()) return;
        String sql = "INSERT INTO expense_item (expense_id, name, name_norm, quantity, unit_price, line_total) "
                + "VALUES (?, ?, ?, ?, ?, ?)";
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            for (Map<String, Object> it : items) {
                String name = str(it.get("nombre")).trim();
                if (name.isBlank()) continue;
                ps.setLong(1, expenseId);
                ps.setString(2, name);
                ps.setString(3, normalize(name));
                setNum(ps, 4, it.get("cantidad"));
                setNum(ps, 5, it.get("precioUnitario"));
                setNum(ps, 6, it.get("total"));
                ps.addBatch();
            }
            ps.executeBatch();
        } catch (Exception e) { throw new RuntimeException("Error guardando productos", e); }
    }

    /** Productos de un gasto visible para el usuario (propio o compartido del hogar). */
    public List<Map<String, Object>> itemsOf(String email, long expenseId) {
        String sql = "SELECT ei.name, ei.quantity, ei.unit_price, ei.line_total "
                + "FROM expense_item ei JOIN expense e ON e.id = ei.expense_id "
                + "WHERE ei.expense_id = ? AND " + VISIBLE_ANY + " ORDER BY ei.id";
        List<Map<String, Object>> out = new ArrayList<>();
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setLong(1, expenseId);
            bindAny(ps, 2, email);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("name", rs.getString("name"));
                    m.put("quantity", num(rs.getBigDecimal("quantity")));
                    m.put("unitPrice", num(rs.getBigDecimal("unit_price")));
                    m.put("lineTotal", num(rs.getBigDecimal("line_total")));
                    out.add(m);
                }
            }
        } catch (Exception e) { throw new RuntimeException("Error listando productos", e); }
        return out;
    }

    // ── Impuestos / cargos de un gasto ──

    /** Inserta los impuestos/cargos de un gasto (kind + amount). Ignora vacíos y montos ≤ 0. */
    public void addTaxes(long expenseId, List<Map<String, Object>> taxes) {
        if (taxes == null || taxes.isEmpty()) return;
        String sql = "INSERT INTO expense_tax (expense_id, kind, amount) VALUES (?, ?, ?)";
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            for (Map<String, Object> t : taxes) {
                String kind = str(t.get("kind")).trim();
                double amount = toDouble(t.get("amount"));
                if (kind.isBlank() || amount <= 0) continue;
                ps.setLong(1, expenseId);
                ps.setString(2, kind);
                ps.setDouble(3, amount);
                ps.addBatch();
            }
            ps.executeBatch();
        } catch (Exception e) { throw new RuntimeException("Error guardando impuestos", e); }
    }

    /** Reemplaza los impuestos/cargos de un gasto del usuario (solo si es suyo). */
    public void replaceTaxes(String email, long expenseId, List<Map<String, Object>> taxes) {
        try (Connection c = ds.getConnection()) {
            try (PreparedStatement del = c.prepareStatement(
                    "DELETE FROM expense_tax WHERE expense_id = ? AND expense_id IN "
                    + "(SELECT id FROM expense WHERE id = ? AND owner_email = ?)")) {
                del.setLong(1, expenseId); del.setLong(2, expenseId); del.setString(3, email);
                del.executeUpdate();
            }
        } catch (Exception e) { throw new RuntimeException("Error limpiando impuestos", e); }
        addTaxes(expenseId, taxes);
    }

    /** Impuestos/cargos de un gasto visible para el usuario (propio o del hogar). */
    public List<Map<String, Object>> taxesOf(String email, long expenseId) {
        String sql = "SELECT t.kind, t.amount FROM expense_tax t JOIN expense e ON e.id = t.expense_id "
                + "WHERE t.expense_id = ? AND " + VISIBLE_ANY + " ORDER BY t.amount DESC, t.id";
        List<Map<String, Object>> out = new ArrayList<>();
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setLong(1, expenseId);
            bindAny(ps, 2, email);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("kind", rs.getString("kind"));
                    m.put("amount", rs.getBigDecimal("amount").doubleValue());
                    out.add(m);
                }
            }
        } catch (Exception e) { throw new RuntimeException("Error listando impuestos", e); }
        return out;
    }

    /**
     * Resumen de impuestos/cargos del mes por ámbito: total pagado en impuestos,
     * total de gasto (para el %), y desglose por tipo de impuesto (agrupado por
     * kind, sin distinguir mayúsculas). Base para la tarjeta/gráfico de impuestos.
     */
    public Map<String, Object> taxSummary(String email, String month, String scope) {
        String sc = norm(scope);
        String ym = month == null || month.isBlank() ? YearMonth.now().toString() : month;
        String sql = "SELECT initcap(lower(t.kind)) AS kind, SUM(t.amount) AS total "
                + "FROM expense_tax t JOIN expense e ON e.id = t.expense_id "
                + "WHERE " + visible(sc) + " AND to_char(e.spent_on,'YYYY-MM') = ? "
                + "GROUP BY initcap(lower(t.kind)) ORDER BY total DESC";
        List<Map<String, Object>> byKind = new ArrayList<>();
        double taxTotal = 0;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            int i = bindVisible(ps, 1, email, sc);
            ps.setString(i, ym);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    double t = rs.getBigDecimal("total").doubleValue();
                    taxTotal += t;
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("kind", rs.getString("kind"));
                    row.put("total", t);
                    byKind.add(row);
                }
            }
        } catch (Exception e) { throw new RuntimeException("Error en resumen de impuestos", e); }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("month", ym);
        out.put("scope", sc);
        out.put("taxTotal", taxTotal);
        out.put("spentTotal", monthTotal(email, ym, sc));   // total del mes, para el %
        out.put("byKind", byKind);
        return out;
    }

    private static double toDouble(Object o) {
        if (o == null) return 0;
        if (o instanceof Number n) return n.doubleValue();
        try { return Double.parseDouble(String.valueOf(o)); } catch (Exception e) { return 0; }
    }

    /**
     * Comparativa de precios por producto y tienda: para cada producto (agrupado
     * por nombre normalizado) devuelve las tiendas donde se ha comprado con su
     * precio mínimo/medio/último, la tienda más barata y el rango de precios.
     */
    public List<Map<String, Object>> prices(String email) {
        // CTE común: puntos de precio visibles para el usuario (propios + del hogar compartidos).
        String cte = """
                WITH pts AS (
                  SELECT ei.name_norm, ei.name,
                         COALESCE(NULLIF(e.merchant, ''), '(sin tienda)') AS store,
                         COALESCE(c.slug, 'otros') AS cat_slug,
                         COALESCE(c.name, 'Sin categoría') AS cat_name,
                         COALESCE(ei.unit_price, ei.line_total / NULLIF(ei.quantity, 0), ei.line_total) AS price,
                         e.spent_on,
                         (e.owner_email <> ?) AS shared_in
                  FROM expense_item ei
                  JOIN expense e ON e.id = ei.expense_id
                  LEFT JOIN category c ON c.id = e.category_id
                  WHERE e.owner_email = ?
                     OR ( e.scope = 'home' AND e.owner_email IN (
                            SELECT CASE WHEN requester_email = ? THEN addressee_email ELSE requester_email END
                            FROM connection WHERE status = 'accepted' AND (requester_email = ? OR addressee_email = ?) ) )
                )
                """;
        String storesSql = cte + """
                SELECT name_norm,
                       (array_agg(name ORDER BY spent_on DESC))[1] AS name,
                       (array_agg(cat_slug ORDER BY spent_on DESC))[1] AS cat_slug,
                       (array_agg(cat_name ORDER BY spent_on DESC))[1] AS cat_name,
                       store,
                       bool_or(shared_in) AS shared_store,
                       MIN(price) AS min_price,
                       AVG(price) AS avg_price,
                       (array_agg(price ORDER BY spent_on DESC))[1] AS last_price,
                       MAX(spent_on) AS last_on,
                       COUNT(*) AS n
                FROM pts
                WHERE price IS NOT NULL
                GROUP BY name_norm, store
                ORDER BY name_norm, min_price ASC
                """;
        Map<String, Map<String, Object>> prod = new LinkedHashMap<>();
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(storesSql)) {
            for (int i = 1; i <= 5; i++) ps.setString(i, email);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    String norm = rs.getString("name_norm");
                    Map<String, Object> p = prod.get(norm);
                    if (p == null) {
                        p = new LinkedHashMap<>();
                        p.put("name", rs.getString("name"));
                        p.put("categorySlug", rs.getString("cat_slug"));
                        p.put("categoryName", rs.getString("cat_name"));
                        p.put("stores", new ArrayList<Map<String, Object>>());
                        p.put("points", new ArrayList<Map<String, Object>>());
                        p.put("minPrice", Double.MAX_VALUE);
                        p.put("maxPrice", 0.0);
                        p.put("shared", false);
                        prod.put(norm, p);
                    }
                    double min = rs.getBigDecimal("min_price").doubleValue();
                    boolean sharedStore = rs.getBoolean("shared_store");
                    Map<String, Object> st = new LinkedHashMap<>();
                    st.put("store", rs.getString("store"));
                    st.put("minPrice", min);
                    st.put("avgPrice", rs.getBigDecimal("avg_price").doubleValue());
                    st.put("lastPrice", rs.getBigDecimal("last_price").doubleValue());
                    st.put("lastOn", rs.getString("last_on"));
                    st.put("count", rs.getInt("n"));
                    st.put("shared", sharedStore);
                    @SuppressWarnings("unchecked")
                    List<Map<String, Object>> stores = (List<Map<String, Object>>) p.get("stores");
                    stores.add(st);
                    p.put("minPrice", Math.min((double) p.get("minPrice"), min));
                    p.put("maxPrice", Math.max((double) p.get("maxPrice"), min));
                    if (sharedStore) p.put("shared", true);
                }
            }
        } catch (Exception e) { throw new RuntimeException("Error comparando precios", e); }

        // Serie temporal de precios por producto (evolución), en orden ascendente por fecha.
        String pointsSql = cte + """
                SELECT name_norm, to_char(spent_on,'YYYY-MM-DD') AS on_date, store, price
                FROM pts WHERE price IS NOT NULL ORDER BY name_norm, spent_on ASC, store
                """;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(pointsSql)) {
            for (int i = 1; i <= 5; i++) ps.setString(i, email);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Map<String, Object> p = prod.get(rs.getString("name_norm"));
                    if (p == null) continue;
                    @SuppressWarnings("unchecked")
                    List<Map<String, Object>> points = (List<Map<String, Object>>) p.get("points");
                    Map<String, Object> pt = new LinkedHashMap<>();
                    pt.put("on", rs.getString("on_date"));
                    pt.put("store", rs.getString("store"));
                    pt.put("price", rs.getBigDecimal("price").doubleValue());
                    points.add(pt);
                }
            }
        } catch (Exception e) { throw new RuntimeException("Error leyendo evolución de precios", e); }

        List<Map<String, Object>> out = new ArrayList<>(prod.values());
        for (Map<String, Object> p : out) {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> stores = (List<Map<String, Object>>) p.get("stores");
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> points = (List<Map<String, Object>>) p.get("points");
            p.put("storeCount", stores.size());
            p.put("cheapestStore", stores.isEmpty() ? "" : stores.get(0).get("store"));
            // Recorta la serie a los últimos 40 puntos para no inflar la respuesta.
            if (points.size() > 40) p.put("points", new ArrayList<>(points.subList(points.size() - 40, points.size())));
            // Precio actual y tendencia (primer vs último punto).
            int n = points.size();
            double lastPrice = n > 0 ? (double) points.get(n - 1).get("price") : 0;
            String lastOn = n > 0 ? (String) points.get(n - 1).get("on") : "";
            double firstPrice = n > 0 ? (double) points.get(0).get("price") : 0;
            int trendPct = firstPrice > 0 ? (int) Math.round((lastPrice - firstPrice) / firstPrice * 100) : 0;
            p.put("lastPrice", lastPrice);
            p.put("lastOn", lastOn);
            p.put("pointCount", n);
            p.put("trendPct", trendPct);
        }
        // Primero los productos con más historial (más útiles para ver evolución), luego por nº de tiendas.
        out.sort((a, b) -> {
            int byPts = Integer.compare((int) b.get("pointCount"), (int) a.get("pointCount"));
            return byPts != 0 ? byPts : Integer.compare((int) b.get("storeCount"), (int) a.get("storeCount"));
        });
        return out;
    }

    private static String normalize(String s) {
        if (s == null) return "";
        return java.text.Normalizer.normalize(s, java.text.Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "").toLowerCase().trim().replaceAll("\\s+", " ");
    }

    private static String str(Object o) { return o == null ? "" : String.valueOf(o); }

    private static Double num(java.math.BigDecimal b) { return b == null ? null : b.doubleValue(); }

    private static void setNum(PreparedStatement ps, int idx, Object v) throws java.sql.SQLException {
        if (v instanceof Number n) ps.setDouble(idx, n.doubleValue());
        else ps.setNull(idx, java.sql.Types.NUMERIC);
    }

    private static String nz(String s) { return s == null ? "" : s; }
}
