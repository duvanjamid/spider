package com.spider.gastos.expense;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Bandeja de notificaciones in-app por usuario (ver V9). Todo se genera desde
 * los eventos de compartir (invitaciones, categorías, compras) y se consulta
 * con un contador de no-leídas para el badge. Aislado por correo.
 */
public class NotificationService {

    private final DataSource ds;

    public NotificationService(DataSource ds) {
        this.ds = ds;
    }

    // ── Escritura ──────────────────────────────────────────────

    /**
     * Inserta una notificación para {@code recipient} evitando duplicados: si ya
     * existe una NO leída con el mismo (recipient, kind, ref), no crea otra.
     */
    public void push(String recipient, String kind, String title, String body, String actor, String ref) {
        if (recipient == null || recipient.isBlank() || recipient.equalsIgnoreCase(actor)) return;
        String sql = """
                INSERT INTO notification (recipient_email, kind, title, body, actor_email, ref)
                SELECT ?, ?, ?, ?, ?, ?
                WHERE NOT EXISTS (
                    SELECT 1 FROM notification
                    WHERE recipient_email = ? AND kind = ? AND read_at IS NULL
                      AND ref IS NOT DISTINCT FROM ?)
                """;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, recipient); ps.setString(2, kind); ps.setString(3, title);
            ps.setString(4, body); ps.setString(5, actor); ps.setString(6, ref);
            ps.setString(7, recipient); ps.setString(8, kind); ps.setString(9, ref);
            ps.executeUpdate();
        } catch (Exception e) { throw new RuntimeException("Error creando notificación", e); }
    }

    /** Alguien invitó a {@code recipient} a conectar (debe aceptar). */
    public void connectionInvite(String actor, String recipient) {
        push(recipient, "connection_invite", "Nueva invitación de hogar",
                nameOf(actor) + " quiere conectar contigo. Acéptalo en Hogar.", actor, actor);
    }

    /** {@code actor} aceptó la invitación de {@code recipient}. */
    public void connectionAccepted(String actor, String recipient) {
        push(recipient, "connection_accepted", "Invitación aceptada",
                nameOf(actor) + " aceptó tu invitación de hogar.", actor, actor);
    }

    /** {@code actor} compartió la categoría {@code name} con cada uno de {@code recipients}. */
    public void categoryShared(String actor, List<String> recipients, String name, String slug) {
        if (recipients == null) return;
        for (String r : recipients) {
            push(r, "category_shared", "Categoría compartida",
                    nameOf(actor) + " compartió la categoría «" + name + "» contigo.", actor, slug);
        }
    }

    /**
     * Nueva compra en una categoría/gasto compartido. Destinatarios: con quienes
     * el dueño comparte esa categoría (category_share) más los del gasto puntual.
     */
    public void sharedExpense(String actor, String categorySlug, String categoryName,
                              long expenseId, List<String> explicitShareWith, String label) {
        Set<String> recipients = new LinkedHashSet<>();
        if (categorySlug != null && !categorySlug.isBlank()) {
            String sql = "SELECT shared_with FROM category_share WHERE owner_email = ? AND slug = ?";
            try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
                ps.setString(1, actor); ps.setString(2, categorySlug);
                try (ResultSet rs = ps.executeQuery()) { while (rs.next()) recipients.add(rs.getString(1)); }
            } catch (Exception e) { throw new RuntimeException("Error buscando destinatarios", e); }
        }
        if (explicitShareWith != null) recipients.addAll(explicitShareWith);
        String cat = categoryName == null || categoryName.isBlank() ? "una categoría compartida" : "«" + categoryName + "»";
        for (String r : recipients) {
            push(r, "shared_expense", "Nueva compra compartida",
                    nameOf(actor) + " agregó " + (label == null || label.isBlank() ? "una compra" : label)
                            + " en " + cat + ".", actor, "exp:" + expenseId);
        }
    }

    // ── Lectura ────────────────────────────────────────────────

    public long unreadCount(String email) {
        String sql = "SELECT count(*) FROM notification WHERE recipient_email = ? AND read_at IS NULL";
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, email);
            try (ResultSet rs = ps.executeQuery()) { return rs.next() ? rs.getLong(1) : 0; }
        } catch (Exception e) { throw new RuntimeException("Error contando notificaciones", e); }
    }

    public List<Map<String, Object>> list(String email, int limit) {
        String sql = """
                SELECT id, kind, title, body, actor_email, ref, created_at, read_at
                FROM notification WHERE recipient_email = ?
                ORDER BY created_at DESC LIMIT ?
                """;
        List<Map<String, Object>> out = new ArrayList<>();
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, email);
            ps.setInt(2, Math.max(1, Math.min(limit, 100)));
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", rs.getLong("id"));
                    m.put("kind", rs.getString("kind"));
                    m.put("title", rs.getString("title"));
                    m.put("body", rs.getString("body"));
                    m.put("actor", rs.getString("actor_email"));
                    m.put("ref", rs.getString("ref"));
                    m.put("createdAt", String.valueOf(rs.getObject("created_at")));
                    m.put("read", rs.getObject("read_at") != null);
                    out.add(m);
                }
            }
        } catch (Exception e) { throw new RuntimeException("Error listando notificaciones", e); }
        return out;
    }

    public void markRead(String email, long id) {
        exec("UPDATE notification SET read_at = now() WHERE id = ? AND recipient_email = ? AND read_at IS NULL",
                ps -> { ps.setLong(1, id); ps.setString(2, email); });
    }

    public void markAllRead(String email) {
        exec("UPDATE notification SET read_at = now() WHERE recipient_email = ? AND read_at IS NULL",
                ps -> ps.setString(1, email));
    }

    // ── Utilidades ─────────────────────────────────────────────

    private interface Binder { void bind(PreparedStatement ps) throws Exception; }

    private void exec(String sql, Binder b) {
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            b.bind(ps);
            ps.executeUpdate();
        } catch (Exception e) { throw new RuntimeException("Error actualizando notificación", e); }
    }

    /** Nombre legible a partir del correo (parte local) para los textos. */
    private static String nameOf(String email) {
        if (email == null || email.isBlank()) return "Alguien";
        int at = email.indexOf('@');
        return at > 0 ? email.substring(0, at) : email;
    }
}
