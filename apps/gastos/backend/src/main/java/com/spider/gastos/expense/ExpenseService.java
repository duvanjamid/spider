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

    /** Gastos de un usuario en un mes ("YYYY-MM"; null = mes actual). */
    public List<Map<String, Object>> listByMonth(String email, String month) {
        String ym = month == null || month.isBlank() ? YearMonth.now().toString() : month;
        String sql = """
                SELECT e.id, e.amount, e.currency, e.merchant, e.description, e.nit,
                       e.spent_on, COALESCE(e.spent_at, e.spent_on::timestamptz) AS spent_at,
                       e.created_at, e.source,
                       c.slug AS cat_slug, c.name AS cat_name, c.color AS cat_color
                FROM expense e LEFT JOIN category c ON c.id = e.category_id
                WHERE e.owner_email = ? AND to_char(e.spent_on, 'YYYY-MM') = ?
                ORDER BY COALESCE(e.spent_at, e.spent_on::timestamptz) DESC, e.id DESC
                """;
        List<Map<String, Object>> out = new ArrayList<>();
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, email);
            ps.setString(2, ym);
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
                    out.add(m);
                }
            }
        } catch (Exception e) { throw new RuntimeException("Error listando gastos", e); }
        return out;
    }

    public long create(String email, double amount, String currency, Long categoryId, String merchant,
                       String description, String spentOn, String spentAt, String nit, String source) {
        LocalDate day = spentOn == null || spentOn.isBlank() ? LocalDate.now() : LocalDate.parse(spentOn);
        java.time.LocalDateTime moment = parseMoment(spentAt, day);
        String sql = """
                INSERT INTO expense (owner_email, amount, currency, category_id, merchant, description,
                                     spent_on, spent_at, nit, source)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

    public void delete(String email, long id) {
        try (Connection c = ds.getConnection();
             PreparedStatement ps = c.prepareStatement("DELETE FROM expense WHERE id = ? AND owner_email = ?")) {
            ps.setLong(1, id);
            ps.setString(2, email);
            ps.executeUpdate();
        } catch (Exception e) { throw new RuntimeException("Error borrando gasto", e); }
    }

    public Map<String, Object> summary(String email, String month) {
        String ym = month == null || month.isBlank() ? YearMonth.now().toString() : month;
        String sql = """
                SELECT COALESCE(c.slug,'otros') AS slug, COALESCE(c.name,'Otros') AS name,
                       COALESCE(c.color,'#9aa3b2') AS color, SUM(e.amount) AS total,
                       MAX(b.amount) AS budget
                FROM expense e
                LEFT JOIN category c ON c.id = e.category_id
                LEFT JOIN budget b ON b.category_id = c.id AND b.owner_email = ?
                WHERE e.owner_email = ? AND to_char(e.spent_on, 'YYYY-MM') = ?
                GROUP BY c.slug, c.name, c.color
                ORDER BY total DESC
                """;
        List<Map<String, Object>> byCat = new ArrayList<>();
        double total = 0;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, email);
            ps.setString(2, email);
            ps.setString(3, ym);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    double t = rs.getBigDecimal("total").doubleValue();
                    total += t;
                    double budget = rs.getBigDecimal("budget") == null ? 0 : rs.getBigDecimal("budget").doubleValue();
                    byCat.add(Map.of("slug", rs.getString("slug"), "name", rs.getString("name"),
                            "color", rs.getString("color"), "total", t, "budget", budget));
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
        int count = countExpenses(email, ym);
        double prev = monthTotal(email, month2.minusMonths(1).toString());

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("month", ym);
        out.put("total", total);
        out.put("byCategory", byCat);
        out.put("count", count);
        out.put("daysInMonth", daysInMonth);
        out.put("daysElapsed", daysElapsed);
        out.put("dailyAverage", dailyAvg);
        out.put("projectedEndOfMonth", projected);
        out.put("previousMonthTotal", prev);
        return out;
    }

    private int countExpenses(String email, String ym) {
        String sql = "SELECT COUNT(*) FROM expense WHERE owner_email = ? AND to_char(spent_on,'YYYY-MM') = ?";
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, email); ps.setString(2, ym);
            try (ResultSet rs = ps.executeQuery()) { rs.next(); return rs.getInt(1); }
        } catch (Exception e) { return 0; }
    }

    private double monthTotal(String email, String ym) {
        String sql = "SELECT COALESCE(SUM(amount),0) FROM expense WHERE owner_email = ? AND to_char(spent_on,'YYYY-MM') = ?";
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, email); ps.setString(2, ym);
            try (ResultSet rs = ps.executeQuery()) { rs.next(); return rs.getBigDecimal(1).doubleValue(); }
        } catch (Exception e) { return 0; }
    }

    public Map<String, Object> trend(String email, int months) {
        int n = months <= 0 ? 6 : Math.min(months, 24);
        String sql = """
                SELECT to_char(date_trunc('month', spent_on), 'YYYY-MM') AS ym, SUM(amount) AS total
                FROM expense
                WHERE owner_email = ?
                  AND spent_on >= (date_trunc('month', current_date) - make_interval(months => ?))
                GROUP BY 1 ORDER BY 1
                """;
        Map<String, Double> totals = new LinkedHashMap<>();
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, email);
            ps.setInt(2, n - 1);
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

    private static String nz(String s) { return s == null ? "" : s; }
}
