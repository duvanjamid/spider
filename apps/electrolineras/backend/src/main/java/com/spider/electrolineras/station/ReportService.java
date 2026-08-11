package com.spider.electrolineras.station;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Types;
import java.util.List;
import java.util.Set;

/** Reportes comunitarios de estado (estación o cargador). */
public class ReportService {

    private static final Set<String> STATION_STATUS = Set.of("active", "inactive");
    private static final Set<String> CHARGER_STATUS = Set.of("free", "busy", "broken");

    private final DataSource ds;
    public ReportService(DataSource ds) { this.ds = ds; }

    /** Registra un reporte. charger_id null = estado de la estación. */
    public long report(String email, long stationId, Long chargerId, String status) {
        String st = status == null ? "" : status.trim().toLowerCase();
        Set<String> allowed = chargerId == null ? STATION_STATUS : CHARGER_STATUS;
        if (!allowed.contains(st)) throw new IllegalArgumentException("estado inválido: " + status);
        String sql = """
                INSERT INTO status_report (station_id, charger_id, owner_email, status)
                VALUES (?, ?, ?, ?) RETURNING id
                """;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setLong(1, stationId);
            if (chargerId == null) ps.setNull(2, Types.BIGINT); else ps.setLong(2, chargerId);
            ps.setString(3, email);
            ps.setString(4, st);
            try (ResultSet rs = ps.executeQuery()) { rs.next(); return rs.getLong(1); }
        } catch (IllegalArgumentException e) { throw e;
        } catch (Exception e) { throw new RuntimeException("Error registrando reporte", e); }
    }

    /** Últimos reportes de una estación (para mostrar actividad reciente). */
    public List<java.util.Map<String, Object>> recent(long stationId, int limit) {
        String sql = """
                SELECT r.status, r.owner_email, r.created_at, c.label AS charger
                FROM status_report r LEFT JOIN charger c ON c.id = r.charger_id
                WHERE r.station_id = ? ORDER BY r.created_at DESC LIMIT ?
                """;
        List<java.util.Map<String, Object>> out = new java.util.ArrayList<>();
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setLong(1, stationId);
            ps.setInt(2, Math.min(Math.max(limit, 1), 50));
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    out.add(java.util.Map.of(
                            "status", rs.getString("status"),
                            "by", mask(rs.getString("owner_email")),
                            "charger", rs.getString("charger") == null ? "" : rs.getString("charger"),
                            "at", String.valueOf(rs.getObject("created_at"))));
                }
            }
        } catch (Exception e) { throw new RuntimeException("Error listando reportes", e); }
        return out;
    }

    /** Muestra solo la parte local del correo, por privacidad. */
    private static String mask(String email) {
        if (email == null) return "anónimo";
        int at = email.indexOf('@');
        return at > 0 ? email.substring(0, at) : email;
    }
}
