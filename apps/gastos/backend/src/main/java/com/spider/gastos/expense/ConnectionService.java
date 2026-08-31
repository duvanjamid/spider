package com.spider.gastos.expense;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Conexiones de "hogar" entre usuarios (por correo). Una invitación nace
 * {@code pending} y el destinatario debe aceptarla. Una vez {@code accepted}
 * el vínculo es bidireccional y habilita compartir gastos/categorías.
 */
public class ConnectionService {

    private final DataSource ds;

    public ConnectionService(DataSource ds) {
        this.ds = ds;
    }

    /** Invita a otro correo (crea una conexión pendiente). Idempotente. */
    public void invite(String requester, String addressee) {
        String a = addressee == null ? "" : addressee.trim().toLowerCase();
        if (a.isBlank() || a.equalsIgnoreCase(requester)) {
            throw new IllegalArgumentException("correo inválido");
        }
        // Si el otro ya me invitó (pendiente en sentido inverso), acepto en vez de duplicar.
        if (acceptReverseIfPending(requester, a)) return;
        String sql = "INSERT INTO connection (requester_email, addressee_email, status) VALUES (?, ?, 'pending') "
                + "ON CONFLICT (requester_email, addressee_email) DO NOTHING";
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, requester);
            ps.setString(2, a);
            ps.executeUpdate();
        } catch (Exception e) { throw new RuntimeException("Error invitando", e); }
    }

    private boolean acceptReverseIfPending(String user, String other) {
        String sql = "UPDATE connection SET status='accepted', responded_at=now() "
                + "WHERE requester_email=? AND addressee_email=? AND status='pending'";
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, other);
            ps.setString(2, user);
            return ps.executeUpdate() > 0;
        } catch (Exception e) { throw new RuntimeException("Error aceptando", e); }
    }

    /** Acepta una invitación recibida (solo el destinatario puede). */
    public void accept(String user, long id) {
        String sql = "UPDATE connection SET status='accepted', responded_at=now() "
                + "WHERE id=? AND addressee_email=? AND status='pending'";
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setLong(1, id);
            ps.setString(2, user);
            ps.executeUpdate();
        } catch (Exception e) { throw new RuntimeException("Error aceptando", e); }
    }

    /** Elimina/rechaza una conexión (cualquiera de las dos partes). */
    public void remove(String user, long id) {
        String sql = "DELETE FROM connection WHERE id=? AND (requester_email=? OR addressee_email=?)";
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setLong(1, id);
            ps.setString(2, user);
            ps.setString(3, user);
            ps.executeUpdate();
        } catch (Exception e) { throw new RuntimeException("Error eliminando conexión", e); }
    }

    /** Estado de conexiones del usuario: aceptadas, invitaciones recibidas y enviadas. */
    public Map<String, Object> overview(String user) {
        List<Map<String, Object>> accepted = new ArrayList<>();
        List<Map<String, Object>> incoming = new ArrayList<>();
        List<Map<String, Object>> outgoing = new ArrayList<>();
        String sql = "SELECT id, requester_email, addressee_email, status FROM connection "
                + "WHERE requester_email=? OR addressee_email=? ORDER BY created_at DESC";
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, user);
            ps.setString(2, user);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    long id = rs.getLong("id");
                    String req = rs.getString("requester_email");
                    String adr = rs.getString("addressee_email");
                    String status = rs.getString("status");
                    String other = user.equalsIgnoreCase(req) ? adr : req;
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id", id);
                    row.put("email", other);
                    if ("accepted".equals(status)) accepted.add(row);
                    else if (user.equalsIgnoreCase(adr)) incoming.add(row);   // me invitaron
                    else outgoing.add(row);                                   // yo invité
                }
            }
        } catch (Exception e) { throw new RuntimeException("Error listando conexiones", e); }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("accepted", accepted);
        out.put("incoming", incoming);
        out.put("outgoing", outgoing);
        return out;
    }

    /** Correos con los que el usuario está conectado (aceptados). */
    public List<String> connected(String user) {
        List<String> out = new ArrayList<>();
        String sql = "SELECT CASE WHEN requester_email=? THEN addressee_email ELSE requester_email END AS email "
                + "FROM connection WHERE status='accepted' AND (requester_email=? OR addressee_email=?)";
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, user);
            ps.setString(2, user);
            ps.setString(3, user);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) out.add(rs.getString("email"));
            }
        } catch (Exception e) { throw new RuntimeException("Error listando hogar", e); }
        return out;
    }

    /** ¿user está conectado (aceptado) con other? */
    public boolean isConnected(String user, String other) {
        return connected(user).stream().anyMatch(e -> e.equalsIgnoreCase(other));
    }
}
