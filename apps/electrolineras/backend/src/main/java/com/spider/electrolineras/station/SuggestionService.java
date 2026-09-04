package com.spider.electrolineras.station;

import com.spider.electrolineras.config.Env;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Sugerencias de corrección de la comunidad (Fase 2). Se agrupan por
 * (estación, tipo, valor); cuando llegan N iguales de personas distintas
 * (Env.suggestionAutoApprove, por defecto 3) se aprueban e aplican solas
 * (queda registrado approved_how='auto'); con menos, quedan pendientes para que
 * un admin las apruebe manualmente ('manual').
 */
public class SuggestionService {

    private static final Logger log = LoggerFactory.getLogger(SuggestionService.class);
    private final DataSource ds;
    private final StationService stations;

    public SuggestionService(DataSource ds, StationService stations) { this.ds = ds; this.stations = stations; }

    /** Registra (o actualiza) el voto de una persona y auto-aprueba si procede. */
    public Map<String, Object> suggest(String email, long stationId, String kind, String value, String detail) {
        int needed = Env.suggestionAutoApprove();
        try (Connection c = ds.getConnection()) {
            try (PreparedStatement ps = c.prepareStatement("""
                    INSERT INTO suggestion (station_id, kind, value, detail, owner_email)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT (station_id, kind, owner_email) DO UPDATE SET
                        value = EXCLUDED.value, detail = EXCLUDED.detail,
                        status = 'pending', approved_how = NULL, created_at = now(), resolved_at = NULL""")) {
                ps.setLong(1, stationId); ps.setString(2, kind); ps.setString(3, value);
                ps.setString(4, detail); ps.setString(5, email);
                ps.executeUpdate();
            }
            int votes = countVotes(c, stationId, kind, value);
            boolean auto = votes >= needed;
            if (auto) { applyKind(stationId, kind, value); resolveGroup(c, stationId, kind, value, "approved", "auto"); }
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("votes", votes); out.put("needed", needed); out.put("autoApproved", auto);
            return out;
        } catch (Exception e) { throw new RuntimeException("No se pudo registrar la sugerencia", e); }
    }

    private int countVotes(Connection c, long stationId, String kind, String value) throws Exception {
        try (PreparedStatement ps = c.prepareStatement(
                "SELECT count(DISTINCT owner_email) FROM suggestion WHERE station_id=? AND kind=? AND value=? AND status='pending'")) {
            ps.setLong(1, stationId); ps.setString(2, kind); ps.setString(3, value);
            try (ResultSet rs = ps.executeQuery()) { return rs.next() ? rs.getInt(1) : 0; }
        }
    }

    private void resolveGroup(Connection c, long stationId, String kind, String value, String status, String how) throws Exception {
        try (PreparedStatement ps = c.prepareStatement("""
                UPDATE suggestion SET status=?, approved_how=?, resolved_at=now()
                WHERE station_id=? AND kind=? AND value=? AND status='pending'""")) {
            ps.setString(1, status); ps.setString(2, how);
            ps.setLong(3, stationId); ps.setString(4, kind); ps.setString(5, value);
            ps.executeUpdate();
        }
    }

    /** Traduce una sugerencia aprobada a un cambio concreto. */
    private void applyKind(long stationId, String kind, String value) {
        if ("chargers".equals(kind)) stations.applyChargers(stationId, value);
        // Otros tipos (name/operator/closed) se resuelven manualmente por ahora.
    }

    /** Admin: aprueba o rechaza un grupo de sugerencias. */
    public void resolve(String kind, long stationId, String value, boolean approve) {
        try (Connection c = ds.getConnection()) {
            if (approve) { applyKind(stationId, kind, value); resolveGroup(c, stationId, kind, value, "approved", "manual"); }
            else resolveGroup(c, stationId, kind, value, "rejected", null);
        } catch (Exception e) { throw new RuntimeException("No se pudo resolver la sugerencia", e); }
    }

    /** Admin: sugerencias pendientes agrupadas (estación, tipo, valor). */
    public List<Map<String, Object>> pending() {
        int needed = Env.suggestionAutoApprove();
        List<Map<String, Object>> out = new ArrayList<>();
        String sql = """
                SELECT g.station_id, g.kind, g.value, count(*) AS votes, max(g.created_at) AS last_at,
                       (SELECT name FROM station WHERE id = g.station_id) AS station_name,
                       (SELECT city FROM station WHERE id = g.station_id) AS station_city,
                       max(g.detail) AS detail
                FROM suggestion g
                WHERE g.status = 'pending'
                GROUP BY g.station_id, g.kind, g.value
                ORDER BY votes DESC, last_at DESC
                LIMIT 200
                """;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql);
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("stationId", rs.getLong("station_id"));
                m.put("stationName", rs.getString("station_name"));
                m.put("stationCity", rs.getString("station_city"));
                m.put("kind", rs.getString("kind"));
                m.put("value", rs.getString("value"));
                m.put("votes", rs.getInt("votes"));
                m.put("needed", needed);
                m.put("detail", rs.getString("detail"));
                m.put("lastAt", String.valueOf(rs.getObject("last_at")));
                out.add(m);
            }
        } catch (Exception e) { throw new RuntimeException("Error listando sugerencias", e); }
        return out;
    }

    /** Nº de grupos de sugerencias pendientes (para el badge del admin). */
    public int pendingCount() {
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(
                "SELECT count(*) FROM (SELECT 1 FROM suggestion WHERE status='pending' GROUP BY station_id, kind, value) t");
             ResultSet rs = ps.executeQuery()) {
            return rs.next() ? rs.getInt(1) : 0;
        } catch (Exception e) { log.debug("pendingCount: {}", e.getMessage()); return 0; }
    }
}
