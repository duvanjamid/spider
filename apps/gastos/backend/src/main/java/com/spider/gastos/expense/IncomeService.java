package com.spider.gastos.expense;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Ingresos del usuario. El total del mes es el "tope global" de gasto. */
public class IncomeService {

    private final DataSource ds;

    public IncomeService(DataSource ds) { this.ds = ds; }

    public List<Map<String, Object>> listByMonth(String email, String month) {
        String ym = (month == null || month.isBlank()) ? YearMonth.now().toString() : month;
        String sql = "SELECT id, amount, source, received_on FROM income "
                + "WHERE owner_email = ? AND to_char(received_on,'YYYY-MM') = ? ORDER BY received_on DESC, id DESC";
        List<Map<String, Object>> out = new ArrayList<>();
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, email); ps.setString(2, ym);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", rs.getLong("id"));
                    m.put("amount", rs.getBigDecimal("amount").doubleValue());
                    m.put("source", rs.getString("source"));
                    m.put("receivedOn", rs.getString("received_on"));
                    out.add(m);
                }
            }
        } catch (Exception e) { throw new RuntimeException("Error listando ingresos", e); }
        return out;
    }

    public double totalForMonth(String email, String month) {
        String ym = (month == null || month.isBlank()) ? YearMonth.now().toString() : month;
        String sql = "SELECT COALESCE(SUM(amount),0) FROM income WHERE owner_email = ? AND to_char(received_on,'YYYY-MM') = ?";
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, email); ps.setString(2, ym);
            try (ResultSet rs = ps.executeQuery()) { return rs.next() ? rs.getBigDecimal(1).doubleValue() : 0; }
        } catch (Exception e) { throw new RuntimeException("Error sumando ingresos", e); }
    }

    public long add(String email, double amount, String source, String receivedOn) {
        String sql = "INSERT INTO income (owner_email, amount, source, received_on) "
                + "VALUES (?, ?, ?, COALESCE(?::date, now())) RETURNING id";
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, email); ps.setDouble(2, amount);
            ps.setString(3, source == null ? "" : source.trim());
            ps.setObject(4, (receivedOn == null || receivedOn.isBlank()) ? null : receivedOn);
            try (ResultSet rs = ps.executeQuery()) { rs.next(); return rs.getLong(1); }
        } catch (Exception e) { throw new RuntimeException("Error registrando ingreso", e); }
    }

    public void delete(String email, long id) {
        try (Connection c = ds.getConnection();
             PreparedStatement ps = c.prepareStatement("DELETE FROM income WHERE owner_email = ? AND id = ?")) {
            ps.setString(1, email); ps.setLong(2, id);
            ps.executeUpdate();
        } catch (Exception e) { throw new RuntimeException("Error borrando ingreso", e); }
    }
}
