package com.spider.gastos.expense;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** Presupuesto mensual por categoría (por usuario). */
public class BudgetService {

    private final DataSource ds;

    public BudgetService(DataSource ds) {
        this.ds = ds;
    }

    public List<Map<String, Object>> list(String email) {
        String sql = """
                SELECT b.category_id, c.slug, c.name, c.color, b.amount
                FROM budget b JOIN category c ON c.id = b.category_id
                WHERE b.owner_email = ?
                ORDER BY c.name
                """;
        List<Map<String, Object>> out = new ArrayList<>();
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, email);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    out.add(Map.of("categoryId", rs.getLong("category_id"), "slug", rs.getString("slug"),
                            "name", rs.getString("name"), "color", rs.getString("color"),
                            "amount", rs.getBigDecimal("amount").doubleValue()));
                }
            }
        } catch (Exception e) { throw new RuntimeException("Error listando presupuestos", e); }
        return out;
    }

    /** Define (o elimina si amount<=0) el presupuesto de una categoría. */
    public void set(String email, long categoryId, double amount) {
        if (amount <= 0) { delete(email, categoryId); return; }
        String sql = """
                INSERT INTO budget (owner_email, category_id, amount) VALUES (?, ?, ?)
                ON CONFLICT (owner_email, category_id) DO UPDATE SET amount = EXCLUDED.amount
                """;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, email); ps.setLong(2, categoryId); ps.setDouble(3, amount);
            ps.executeUpdate();
        } catch (Exception e) { throw new RuntimeException("Error guardando presupuesto", e); }
    }

    private void delete(String email, long categoryId) {
        try (Connection c = ds.getConnection();
             PreparedStatement ps = c.prepareStatement("DELETE FROM budget WHERE owner_email = ? AND category_id = ?")) {
            ps.setString(1, email); ps.setLong(2, categoryId);
            ps.executeUpdate();
        } catch (Exception e) { throw new RuntimeException("Error borrando presupuesto", e); }
    }
}
