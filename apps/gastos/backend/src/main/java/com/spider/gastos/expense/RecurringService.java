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

/** Gastos recurrentes (suscripciones, arriendo…) y su materialización mensual. */
public class RecurringService {

    private final DataSource ds;

    public RecurringService(DataSource ds) {
        this.ds = ds;
    }

    public List<Map<String, Object>> list(String email) {
        String sql = """
                SELECT r.id, r.amount, r.currency, r.merchant, r.description, r.day_of_month, r.active,
                       c.name AS cat_name, c.color AS cat_color, r.category_id
                FROM recurring r LEFT JOIN category c ON c.id = r.category_id
                WHERE r.owner_email = ? ORDER BY r.day_of_month, r.id
                """;
        List<Map<String, Object>> out = new ArrayList<>();
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, email);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", rs.getLong("id"));
                    m.put("amount", rs.getBigDecimal("amount").doubleValue());
                    m.put("currency", rs.getString("currency"));
                    m.put("merchant", nz(rs.getString("merchant")));
                    m.put("description", nz(rs.getString("description")));
                    m.put("dayOfMonth", rs.getInt("day_of_month"));
                    m.put("active", rs.getBoolean("active"));
                    m.put("categoryId", rs.getObject("category_id"));
                    m.put("categoryName", nz(rs.getString("cat_name")));
                    m.put("categoryColor", nz(rs.getString("cat_color")));
                    out.add(m);
                }
            }
        } catch (Exception e) { throw new RuntimeException("Error listando recurrentes", e); }
        return out;
    }

    public long create(String email, double amount, String currency, Long categoryId, String merchant,
                       String description, int dayOfMonth) {
        String sql = """
                INSERT INTO recurring (owner_email, amount, currency, category_id, merchant, description, day_of_month)
                VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id
                """;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, email); ps.setDouble(2, amount);
            ps.setString(3, currency == null || currency.isBlank() ? "COP" : currency);
            ps.setObject(4, categoryId);
            ps.setString(5, merchant); ps.setString(6, description);
            ps.setInt(7, Math.min(Math.max(dayOfMonth, 1), 28));
            try (ResultSet rs = ps.executeQuery()) { rs.next(); return rs.getLong(1); }
        } catch (Exception e) { throw new RuntimeException("Error creando recurrente", e); }
    }

    public void delete(String email, long id) {
        try (Connection c = ds.getConnection();
             PreparedStatement ps = c.prepareStatement("DELETE FROM recurring WHERE id = ? AND owner_email = ?")) {
            ps.setLong(1, id); ps.setString(2, email);
            ps.executeUpdate();
        } catch (Exception e) { throw new RuntimeException("Error borrando recurrente", e); }
    }

    /** Crea los gastos de las reglas activas para el mes indicado (idempotente). */
    public int applyForMonth(String email, String month) {
        YearMonth ym = month == null || month.isBlank() ? YearMonth.now() : YearMonth.parse(month);
        int created = 0;
        String insert = """
                INSERT INTO expense (owner_email, amount, currency, category_id, merchant, description,
                                     spent_on, source, recurring_id)
                SELECT r.owner_email, r.amount, r.currency, r.category_id, r.merchant,
                       COALESCE(r.description, 'Recurrente'), ?, 'recurring', r.id
                FROM recurring r
                WHERE r.owner_email = ? AND r.active = TRUE AND r.id = ?
                  AND NOT EXISTS (
                    SELECT 1 FROM expense e
                    WHERE e.owner_email = r.owner_email AND e.recurring_id = r.id
                      AND to_char(e.spent_on, 'YYYY-MM') = ?
                  )
                """;
        try (Connection c = ds.getConnection()) {
            List<long[]> rules = new ArrayList<>(); // id, day
            try (PreparedStatement q = c.prepareStatement(
                    "SELECT id, day_of_month FROM recurring WHERE owner_email = ? AND active = TRUE")) {
                q.setString(1, email);
                try (ResultSet rs = q.executeQuery()) {
                    while (rs.next()) rules.add(new long[]{ rs.getLong(1), rs.getInt(2) });
                }
            }
            for (long[] r : rules) {
                LocalDate date = ym.atDay((int) Math.min(r[1], ym.lengthOfMonth()));
                try (PreparedStatement ps = c.prepareStatement(insert)) {
                    ps.setObject(1, date);
                    ps.setString(2, email);
                    ps.setLong(3, r[0]);
                    ps.setString(4, ym.toString());
                    created += ps.executeUpdate();
                }
            }
        } catch (Exception e) { throw new RuntimeException("Error aplicando recurrentes", e); }
        return created;
    }

    private static String nz(String s) { return s == null ? "" : s; }
}
