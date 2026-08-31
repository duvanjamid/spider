package com.spider.alertas.alert;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Reputación e identidad seudónima del reporter.
 *
 * <p>El correo real se guarda para auditoría/responsabilidad legal, pero la
 * comunidad SOLO ve un seudónimo estable (p.ej. {@code Centinela-4821}).</p>
 *
 * <p>Puntaje: +2 por confirmación recibida, −3 por desmentido. Niveles:</p>
 * <ul>
 *   <li>{@code < 0}  → penalizado (sus reportes pesan menos).</li>
 *   <li>{@code 0..9} → nuevo.</li>
 *   <li>{@code 10..29} → confiable.</li>
 *   <li>{@code ≥ 30} → veterano (puede marcar como oficial más rápido).</li>
 * </ul>
 */
public class ReporterService {

    private static final String[] ADJ = {
            "Centinela", "Vigía", "Guardián", "Faro", "Halcón",
            "Brújula", "Radar", "Alerta", "Escudo", "Vigilante"
    };

    private final DataSource ds;
    public ReporterService(DataSource ds) { this.ds = ds; }

    /** Devuelve (creando si hace falta) el reporter del correo dado. */
    public Map<String, Object> ensure(String email) {
        Map<String, Object> me = find(email);
        if (me != null) return me;
        String pseudonym = generatePseudonym(email);
        String sql = """
                INSERT INTO reporter (owner_email, pseudonym) VALUES (?, ?)
                ON CONFLICT (owner_email) DO NOTHING
                """;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, email);
            ps.setString(2, pseudonym);
            ps.executeUpdate();
        } catch (Exception e) { throw new RuntimeException("Error creando reporter", e); }
        return find(email);
    }

    public Map<String, Object> find(String email) {
        String sql = "SELECT owner_email, pseudonym, score, reports, confirmed, denied FROM reporter WHERE owner_email = ?";
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, email);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) return null;
                return row(rs);
            }
        } catch (Exception e) { throw new RuntimeException("Error leyendo reporter", e); }
    }

    /** Ajusta el puntaje de un reporter (por su email) sumando delta. */
    public void addScore(String email, int delta) {
        String sql = "UPDATE reporter SET score = score + ? WHERE owner_email = ?";
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setInt(1, delta);
            ps.setString(2, email);
            ps.executeUpdate();
        } catch (Exception e) { throw new RuntimeException("Error ajustando puntaje", e); }
    }

    /** Incrementa contadores agregados del reporter. */
    public void bump(String email, int reports, int confirmed, int denied) {
        String sql = "UPDATE reporter SET reports = reports + ?, confirmed = confirmed + ?, denied = denied + ? WHERE owner_email = ?";
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setInt(1, reports);
            ps.setInt(2, confirmed);
            ps.setInt(3, denied);
            ps.setString(4, email);
            ps.executeUpdate();
        } catch (Exception e) { throw new RuntimeException("Error actualizando contadores", e); }
    }

    public static String level(int score) {
        if (score < 0) return "penalizado";
        if (score < 10) return "nuevo";
        if (score < 30) return "confiable";
        return "veterano";
    }

    private Map<String, Object> row(ResultSet rs) throws java.sql.SQLException {
        int score = rs.getInt("score");
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("pseudonym", rs.getString("pseudonym"));
        m.put("score", score);
        m.put("level", level(score));
        m.put("reports", rs.getInt("reports"));
        m.put("confirmed", rs.getInt("confirmed"));
        m.put("denied", rs.getInt("denied"));
        return m;
    }

    /** Seudónimo determinista y estable a partir del correo (sin exponerlo). */
    private static String generatePseudonym(String email) {
        int h = Math.abs(email.hashCode());
        String adj = ADJ[h % ADJ.length];
        int num = 1000 + (h / ADJ.length) % 9000;   // 4 dígitos
        return adj + "-" + num;
    }
}
