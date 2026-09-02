package com.spider.gastos.expense;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;

/**
 * Alertas de tope: al registrar/editar un gasto, comprueba si el usuario superó
 * el presupuesto de alguna categoría o su tope global del mes (ingresos). Cada
 * cruce se avisa UNA sola vez por categoría/mes (tabla {@code budget_alert}) con
 * una notificación in-app y, si está habilitado, un push al dispositivo.
 */
public class AlertService {

    /** category_id reservado para el «tope global» (los ids reales empiezan en 1). */
    private static final long GLOBAL = 0;

    private final DataSource ds;
    private final IncomeService income;
    private final NotificationService notifications;

    public AlertService(DataSource ds, IncomeService income, NotificationService notifications) {
        this.ds = ds;
        this.income = income;
        this.notifications = notifications;
    }

    private record Cross(long categoryId, String name, double spent, double budget) {}

    /** Evalúa topes del usuario para el mes del gasto y avisa de los nuevos cruces. */
    public void check(String email, String month) {
        String ym = month == null || month.isBlank() ? YearMonth.now().toString() : month;
        try {
            for (Cross c : categoryCrossings(email, ym)) {
                if (firstCrossing(email, c.categoryId(), ym)) {
                    String title = "Tope de «" + c.name() + "» superado";
                    String body = "Llevas " + money(c.spent()) + " de " + money(c.budget()) + " este mes.";
                    notify(email, "budget:" + c.categoryId() + ":" + ym, title, body);
                }
            }
            checkGlobal(email, ym);
        } catch (Exception e) {
            // Nunca romper el alta del gasto por un fallo evaluando alertas.
            org.slf4j.LoggerFactory.getLogger(AlertService.class).warn("Fallo evaluando alertas: {}", e.getMessage());
        }
    }

    private List<Cross> categoryCrossings(String email, String ym) {
        String sql = """
                SELECT b.category_id, c.name, b.amount AS budget,
                       COALESCE((SELECT SUM(e.amount) FROM expense e
                                 WHERE e.owner_email = ? AND e.category_id = b.category_id
                                   AND to_char(e.spent_on,'YYYY-MM') = ?), 0) AS spent
                FROM budget b JOIN category c ON c.id = b.category_id
                WHERE b.owner_email = ? AND b.amount > 0
                """;
        List<Cross> out = new ArrayList<>();
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, email); ps.setString(2, ym); ps.setString(3, email);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    double budget = rs.getBigDecimal("budget").doubleValue();
                    double spent = rs.getBigDecimal("spent").doubleValue();
                    if (spent >= budget) out.add(new Cross(rs.getLong("category_id"), rs.getString("name"), spent, budget));
                }
            }
        } catch (Exception e) { throw new RuntimeException("Error evaluando topes por categoría", e); }
        return out;
    }

    private void checkGlobal(String email, String ym) {
        double tope = income.totalForMonth(email, ym);
        if (tope <= 0) return;                       // sin ingresos declarados no hay tope global
        double spent = monthSpend(email, ym);
        if (spent < tope) return;
        if (firstCrossing(email, GLOBAL, ym)) {
            String body = "Gastaste " + money(spent) + " de tus " + money(tope) + " de ingresos del mes.";
            notify(email, "budget:global:" + ym, "Superaste tu tope del mes", body);
        }
    }

    private double monthSpend(String email, String ym) {
        String sql = "SELECT COALESCE(SUM(amount),0) FROM expense WHERE owner_email = ? AND to_char(spent_on,'YYYY-MM') = ?";
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, email); ps.setString(2, ym);
            try (ResultSet rs = ps.executeQuery()) { return rs.next() ? rs.getBigDecimal(1).doubleValue() : 0; }
        } catch (Exception e) { return 0; }
    }

    /** Registra el cruce (dedupe por owner+categoría+periodo). true si es la 1ª vez. */
    private boolean firstCrossing(String email, long categoryId, String ym) {
        String sql = "INSERT INTO budget_alert (owner_email, category_id, period) VALUES (?, ?, ?) ON CONFLICT DO NOTHING";
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, email); ps.setLong(2, categoryId); ps.setString(3, ym);
            return ps.executeUpdate() > 0;
        } catch (Exception e) { return false; }
    }

    private void notify(String email, String ref, String title, String body) {
        // NotificationService ya envía el push al insertar la notificación in-app.
        notifications.push(email, "budget_exceeded", title, body, null, ref);
    }

    private static String money(double v) {
        return "$" + String.format(java.util.Locale.US, "%,.0f", v);
    }
}
