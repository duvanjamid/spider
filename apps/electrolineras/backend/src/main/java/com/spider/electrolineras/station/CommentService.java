package com.spider.electrolineras.station;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** Comentarios por estación. */
public class CommentService {

    private final DataSource ds;
    public CommentService(DataSource ds) { this.ds = ds; }

    public List<Map<String, Object>> list(long stationId) {
        String sql = "SELECT owner_email, body, created_at FROM station_comment WHERE station_id = ? ORDER BY created_at DESC LIMIT 100";
        List<Map<String, Object>> out = new ArrayList<>();
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setLong(1, stationId);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    out.add(Map.of("by", mask(rs.getString("owner_email")),
                            "body", rs.getString("body"),
                            "at", String.valueOf(rs.getObject("created_at"))));
                }
            }
        } catch (Exception e) { throw new RuntimeException("Error listando comentarios", e); }
        return out;
    }

    public long add(String email, long stationId, String body) {
        if (body == null || body.isBlank()) throw new IllegalArgumentException("comentario vacío");
        String text = body.trim();
        if (text.length() > 1000) text = text.substring(0, 1000);
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(
                "INSERT INTO station_comment (station_id, owner_email, body) VALUES (?, ?, ?) RETURNING id")) {
            ps.setLong(1, stationId);
            ps.setString(2, email);
            ps.setString(3, text);
            try (ResultSet rs = ps.executeQuery()) { rs.next(); return rs.getLong(1); }
        } catch (IllegalArgumentException e) { throw e;
        } catch (Exception e) { throw new RuntimeException("Error agregando comentario", e); }
    }

    private static String mask(String email) {
        if (email == null) return "anónimo";
        int at = email.indexOf('@');
        return at > 0 ? email.substring(0, at) : email;
    }
}
