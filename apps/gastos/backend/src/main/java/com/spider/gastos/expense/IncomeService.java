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

    private static String norm(String scope) { return "home".equals(scope) ? "home" : "mine"; }
    /** Visibilidad de ingresos por ámbito (alias i). mine=1 parámetro, home=4. */
    private static String visible(String scope) {
        if ("home".equals(scope)) {
            return "( i.scope = 'home' AND i.owner_email IN ("
                    + " SELECT ? UNION SELECT CASE WHEN requester_email = ? THEN addressee_email ELSE requester_email END"
                    + " FROM connection WHERE status = 'accepted' AND (requester_email = ? OR addressee_email = ?) ) )";
        }
        return "( i.owner_email = ? AND i.scope = 'mine' )";
    }
    private static int bind(PreparedStatement ps, int from, String email, String scope) throws java.sql.SQLException {
        int n = "home".equals(scope) ? 4 : 1;
        for (int k = 0; k < n; k++) ps.setString(from + k, email);
        return from + n;
    }

    public List<Map<String, Object>> listByMonth(String email, String month, String scope) {
        String sc = norm(scope);
        String ym = (month == null || month.isBlank()) ? YearMonth.now().toString() : month;
        String sql = "SELECT i.id, i.amount, i.source, i.received_on, i.owner_email AS owner, i.scope FROM income i "
                + "WHERE " + visible(sc) + " AND to_char(i.received_on,'YYYY-MM') = ? ORDER BY i.received_on DESC, i.id DESC";
        List<Map<String, Object>> out = new ArrayList<>();
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            int i = bind(ps, 1, email, sc); ps.setString(i, ym);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", rs.getLong("id"));
                    m.put("amount", rs.getBigDecimal("amount").doubleValue());
                    m.put("source", rs.getString("source"));
                    m.put("receivedOn", rs.getString("received_on"));
                    m.put("scope", rs.getString("scope"));
                    String owner = rs.getString("owner");
                    boolean mine = owner != null && owner.equalsIgnoreCase(email);
                    m.put("mine", mine);
                    m.put("by", mine ? "" : (owner == null ? "" : owner));
                    m.put("canEdit", mine);
                    out.add(m);
                }
            }
        } catch (Exception e) { throw new RuntimeException("Error listando ingresos", e); }
        return out;
    }

    public double totalForMonth(String email, String month, String scope) {
        String sc = norm(scope);
        String ym = (month == null || month.isBlank()) ? YearMonth.now().toString() : month;
        String sql = "SELECT COALESCE(SUM(i.amount),0) FROM income i WHERE " + visible(sc) + " AND to_char(i.received_on,'YYYY-MM') = ?";
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            int i = bind(ps, 1, email, sc); ps.setString(i, ym);
            try (ResultSet rs = ps.executeQuery()) { return rs.next() ? rs.getBigDecimal(1).doubleValue() : 0; }
        } catch (Exception e) { throw new RuntimeException("Error sumando ingresos", e); }
    }

    public long add(String email, double amount, String source, String receivedOn, String scope) {
        String sql = "INSERT INTO income (owner_email, amount, source, received_on, scope) "
                + "VALUES (?, ?, ?, COALESCE(?::date, now()), ?) RETURNING id";
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, email); ps.setDouble(2, amount);
            ps.setString(3, source == null ? "" : source.trim());
            ps.setObject(4, (receivedOn == null || receivedOn.isBlank()) ? null : receivedOn);
            ps.setString(5, norm(scope));
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
