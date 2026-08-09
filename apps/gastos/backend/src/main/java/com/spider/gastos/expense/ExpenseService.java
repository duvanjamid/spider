package com.spider.gastos.expense;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Lógica de datos de gastos (JDBC). Devuelve estructuras JSON-friendly. */
public class ExpenseService {

    private final DataSource ds;

    public ExpenseService(DataSource ds) {
        this.ds = ds;
    }

    public List<Map<String, Object>> categories() {
        List<Map<String, Object>> out = new ArrayList<>();
        String sql = "SELECT slug, name, color, icon FROM category ORDER BY name";
        try (Connection c = ds.getConnection(); Statement st = c.createStatement();
             ResultSet rs = st.executeQuery(sql)) {
            while (rs.next()) {
                out.add(Map.of("slug", rs.getString("slug"), "name", rs.getString("name"),
                        "color", rs.getString("color"), "icon", rs.getString("icon")));
            }
        } catch (Exception e) { throw new RuntimeException("Error listando categorías", e); }
        return out;
    }

    /** Gastos de un mes ("YYYY-MM"); si es null, el mes actual. */
    public List<Map<String, Object>> listByMonth(String month) {
        String ym = month == null || month.isBlank() ? YearMonth.now().toString() : month;
        String sql = """
                SELECT e.id, e.amount, e.currency, e.merchant, e.description,
                       e.spent_on, e.source, c.slug AS cat_slug, c.name AS cat_name, c.color AS cat_color
                FROM expense e LEFT JOIN category c ON c.id = e.category_id
                WHERE to_char(e.spent_on, 'YYYY-MM') = ?
                ORDER BY e.spent_on DESC, e.id DESC
                """;
        List<Map<String, Object>> out = new ArrayList<>();
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, ym);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", rs.getLong("id"));
                    m.put("amount", rs.getBigDecimal("amount").doubleValue());
                    m.put("currency", rs.getString("currency"));
                    m.put("merchant", nz(rs.getString("merchant")));
                    m.put("description", nz(rs.getString("description")));
                    m.put("spentOn", rs.getString("spent_on"));
                    m.put("source", rs.getString("source"));
                    m.put("categorySlug", nz(rs.getString("cat_slug")));
                    m.put("categoryName", nz(rs.getString("cat_name")));
                    m.put("categoryColor", nz(rs.getString("cat_color")));
                    out.add(m);
                }
            }
        } catch (Exception e) { throw new RuntimeException("Error listando gastos", e); }
        return out;
    }

    public long create(double amount, String currency, String categorySlug, String merchant,
                       String description, String spentOn, String source) {
        String sql = """
                INSERT INTO expense (amount, currency, category_id, merchant, description, spent_on, source)
                VALUES (?, ?, (SELECT id FROM category WHERE slug = ?), ?, ?, ?, ?)
                RETURNING id
                """;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setDouble(1, amount);
            ps.setString(2, currency == null || currency.isBlank() ? "COP" : currency);
            ps.setString(3, categorySlug);
            ps.setString(4, merchant);
            ps.setString(5, description);
            ps.setObject(6, spentOn == null || spentOn.isBlank() ? LocalDate.now() : LocalDate.parse(spentOn));
            ps.setString(7, source == null || source.isBlank() ? "manual" : source);
            try (ResultSet rs = ps.executeQuery()) { rs.next(); return rs.getLong(1); }
        } catch (Exception e) { throw new RuntimeException("Error creando gasto", e); }
    }

    public void delete(long id) {
        try (Connection c = ds.getConnection();
             PreparedStatement ps = c.prepareStatement("DELETE FROM expense WHERE id = ?")) {
            ps.setLong(1, id);
            ps.executeUpdate();
        } catch (Exception e) { throw new RuntimeException("Error borrando gasto", e); }
    }

    /** Resumen del mes: total y desglose por categoría. */
    public Map<String, Object> summary(String month) {
        String ym = month == null || month.isBlank() ? YearMonth.now().toString() : month;
        String sql = """
                SELECT COALESCE(c.slug,'otros') AS slug, COALESCE(c.name,'Otros') AS name,
                       COALESCE(c.color,'#9aa3b2') AS color, SUM(e.amount) AS total
                FROM expense e LEFT JOIN category c ON c.id = e.category_id
                WHERE to_char(e.spent_on, 'YYYY-MM') = ?
                GROUP BY c.slug, c.name, c.color
                ORDER BY total DESC
                """;
        List<Map<String, Object>> byCat = new ArrayList<>();
        double total = 0;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, ym);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    double t = rs.getBigDecimal("total").doubleValue();
                    total += t;
                    byCat.add(Map.of("slug", rs.getString("slug"), "name", rs.getString("name"),
                            "color", rs.getString("color"), "total", t));
                }
            }
        } catch (Exception e) { throw new RuntimeException("Error en resumen", e); }
        return Map.of("month", ym, "total", total, "byCategory", byCat);
    }

    /** Totales de los últimos N meses + estimación simple del próximo mes. */
    public Map<String, Object> trend(int months) {
        int n = months <= 0 ? 6 : Math.min(months, 24);
        String sql = """
                SELECT to_char(date_trunc('month', spent_on), 'YYYY-MM') AS ym, SUM(amount) AS total
                FROM expense
                WHERE spent_on >= (date_trunc('month', current_date) - make_interval(months => ?))
                GROUP BY 1 ORDER BY 1
                """;
        Map<String, Double> totals = new LinkedHashMap<>();
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setInt(1, n - 1);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) totals.put(rs.getString("ym"), rs.getBigDecimal("total").doubleValue());
            }
        } catch (Exception e) { throw new RuntimeException("Error en tendencia", e); }

        // Rellena meses sin gasto con 0 para una serie continua.
        List<Map<String, Object>> series = new ArrayList<>();
        YearMonth start = YearMonth.now().minusMonths(n - 1L);
        double sum = 0; int count = 0;
        for (int i = 0; i < n; i++) {
            String ym = start.plusMonths(i).toString();
            double t = totals.getOrDefault(ym, 0.0);
            series.add(Map.of("month", ym, "total", t));
            sum += t; count++;
        }
        // Estimación: promedio móvil ponderado hacia meses recientes.
        double forecast = count == 0 ? 0 : weightedForecast(series);
        return Map.of("series", series, "forecastNext", forecast,
                "average", count == 0 ? 0 : sum / count);
    }

    private static double weightedForecast(List<Map<String, Object>> series) {
        double num = 0, den = 0;
        for (int i = 0; i < series.size(); i++) {
            double w = i + 1;                       // más peso a lo reciente
            num += w * (double) series.get(i).get("total");
            den += w;
        }
        return den == 0 ? 0 : num / den;
    }

    private static String nz(String s) { return s == null ? "" : s; }
}
