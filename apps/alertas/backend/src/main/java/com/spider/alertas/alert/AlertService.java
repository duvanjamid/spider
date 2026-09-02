package com.spider.alertas.alert;

import com.spider.alertas.alert.Categories.Cat;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Types;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Núcleo colaborativo de alertas: crear reportes con radio por categoría,
 * listar por cercanía, confirmar/desmentir con voto geo-restringido (solo
 * quien está dentro del radio puede votar), reputación y detección de crisis.
 */
public class AlertService {

    /** Máx. tamaño de foto base64 aceptado (~350 KB). */
    private static final int MAX_PHOTO = 480_000;
    /** Para detectar crisis: ventana temporal y radio de agrupación. */
    private static final double CRISIS_KM = 25;
    private static final int CRISIS_MIN = 30;
    private static final int CRISIS_COUNT = 2;   // otros reportes ≈ 3 en total

    private final DataSource ds;
    private final ReporterService reporters;

    public AlertService(DataSource ds, ReporterService reporters) {
        this.ds = ds;
        this.reporters = reporters;
    }

    public record NewAlert(String category, String description, String photo, Double lat, Double lon) {}

    /** Crea una alerta. El radio y el TTL los fija la categoría. */
    public Map<String, Object> create(String email, NewAlert in) {
        if (in == null || in.lat() == null || in.lon() == null)
            throw new IllegalArgumentException("ubicación requerida");
        Cat cat = Categories.get(in.category());
        var me = reporters.ensure(email);
        String photo = in.photo();
        if (photo != null && photo.length() > MAX_PHOTO) photo = null;   // se descarta si excede
        String desc = in.description() == null ? null : in.description().trim();

        boolean crisis = countNearby(cat.slug(), in.lat(), in.lon()) >= CRISIS_COUNT;
        String status = crisis ? "crisis" : "activa";

        String sql = """
                INSERT INTO alert (owner_email, pseudonym, category, description, photo,
                                   lat, lon, radius_km, status, expires_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, now() + make_interval(hours => ?))
                RETURNING id
                """;
        long id;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, email);
            ps.setString(2, (String) me.get("pseudonym"));
            ps.setString(3, cat.slug());
            if (desc == null || desc.isBlank()) ps.setNull(4, Types.VARCHAR); else ps.setString(4, desc);
            if (photo == null) ps.setNull(5, Types.VARCHAR); else ps.setString(5, photo);
            ps.setDouble(6, in.lat());
            ps.setDouble(7, in.lon());
            ps.setDouble(8, cat.radiusKm());
            ps.setString(9, status);
            ps.setInt(10, cat.ttlHours());
            try (ResultSet rs = ps.executeQuery()) { rs.next(); id = rs.getLong(1); }
        } catch (Exception e) { throw new RuntimeException("Error creando alerta", e); }

        reporters.bump(email, 1, 0, 0);
        // Si esta alerta dispara crisis, marca también las cercanas de la misma categoría.
        if (crisis) escalateNearbyToCrisis(cat.slug(), in.lat(), in.lon());
        return detail(id, email);
    }

    /** Alertas activas cerca de un punto, ordenadas por distancia (km). */
    public List<Map<String, Object>> nearby(double lat, double lon, double maxKm) {
        String sql = """
                SELECT *, (%s) AS dist_km FROM alert
                WHERE status IN ('activa','oficial','crisis')
                  AND expires_at > now()
                ORDER BY dist_km ASC
                LIMIT 300
                """.formatted(haversine("lat", "lon", lat, lon));
        List<Map<String, Object>> out = new ArrayList<>();
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    double dist = rs.getDouble("dist_km");
                    if (maxKm > 0 && dist > maxKm) continue;
                    out.add(brief(rs, dist));
                }
            }
        } catch (Exception e) { throw new RuntimeException("Error listando alertas", e); }
        return out;
    }

    /** Detalle de una alerta (incluye mi voto y si marqué "a salvo"). */
    public Map<String, Object> detail(long id, String email) {
        String sql = "SELECT * FROM alert WHERE id = ?";
        Map<String, Object> a;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setLong(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) return null;
                a = brief(rs, -1);
                a.put("description", rs.getString("description"));
                a.put("photo", rs.getString("photo"));
            }
        } catch (Exception e) { throw new RuntimeException("Error leyendo alerta", e); }
        a.put("myVote", myVote(id, email));
        a.put("iAmSafe", isSafe(id, email));
        a.put("safeCount", safeCount(id));
        return a;
    }

    /**
     * Confirma o desmiente una alerta. Solo puede votar quien esté dentro del
     * radio de acción (voto geo-restringido). Actualiza contadores, reputación
     * del autor y puede promover a "oficial" o marcar "falsa".
     */
    public Map<String, Object> vote(long id, String email, String vote, Double lat, Double lon) {
        String v = vote == null ? "" : vote.trim().toLowerCase();
        if (!v.equals("confirm") && !v.equals("deny"))
            throw new IllegalArgumentException("voto inválido");
        reporters.ensure(email);

        Map<String, Object> alert = rawAlert(id);
        if (alert == null) throw new IllegalArgumentException("la alerta no existe");
        String owner = (String) alert.get("owner_email");
        if (owner.equals(email)) throw new IllegalArgumentException("no puedes votar tu propio reporte");
        double alat = (double) alert.get("lat"), alon = (double) alert.get("lon");
        double radius = (double) alert.get("radius_km");
        if (lat == null || lon == null || distanceKm(lat, lon, alat, alon) > radius)
            throw new IllegalArgumentException("debes estar dentro del área para validar este reporte");

        String prev = myVote(id, email);
        if (v.equals(prev)) return detail(id, email);   // idempotente

        try (Connection c = ds.getConnection()) {
            c.setAutoCommit(false);
            try {
                upsertVote(c, id, email, v);
                // Ajusta contadores según transición de voto.
                int dConfirm = 0, dDeny = 0;
                if (prev == null) { if (v.equals("confirm")) dConfirm = 1; else dDeny = 1; }
                else if (prev.equals("confirm")) { dConfirm = -1; dDeny = 1; }
                else { dConfirm = 1; dDeny = -1; }
                applyCounts(c, id, dConfirm, dDeny);
                c.commit();
            } catch (Exception e) { c.rollback(); throw e; }
        } catch (Exception e) { throw new RuntimeException("Error registrando voto", e); }

        // Reputación del autor: +2 por confirmación, −3 por desmentido (por transición neta).
        if (prev == null) reporters.addScore(owner, v.equals("confirm") ? 2 : -3);
        else reporters.addScore(owner, v.equals("confirm") ? 5 : -5);  // cambió de deny→confirm o viceversa
        if (v.equals("confirm")) reporters.bump(owner, 0, 1, 0); else reporters.bump(owner, 0, 0, 1);

        reevaluateStatus(id, owner);
        return detail(id, email);
    }

    /** Marca "estoy a salvo" para una alerta (idempotente por usuario). */
    public Map<String, Object> markSafe(long id, String email, Double lat, Double lon) {
        reporters.ensure(email);
        String sql = """
                INSERT INTO safe_status (alert_id, owner_email, lat, lon) VALUES (?, ?, ?, ?)
                ON CONFLICT (alert_id, owner_email) DO UPDATE SET lat = EXCLUDED.lat, lon = EXCLUDED.lon
                """;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setLong(1, id);
            ps.setString(2, email);
            if (lat == null) ps.setNull(3, Types.DOUBLE); else ps.setDouble(3, lat);
            if (lon == null) ps.setNull(4, Types.DOUBLE); else ps.setDouble(4, lon);
            ps.executeUpdate();
        } catch (Exception e) { throw new RuntimeException("Error marcando a salvo", e); }
        return detail(id, email);
    }

    /** El autor resuelve/cierra su alerta. */
    public Map<String, Object> resolve(long id, String email) {
        Map<String, Object> alert = rawAlert(id);
        if (alert == null) throw new IllegalArgumentException("la alerta no existe");
        if (!email.equals(alert.get("owner_email")))
            throw new IllegalArgumentException("solo el autor puede resolver su reporte");
        update("UPDATE alert SET status = 'resuelta' WHERE id = ?", id);
        return detail(id, email);
    }

    /** Mis reportes (para el perfil). */
    public List<Map<String, Object>> mine(String email) {
        String sql = "SELECT * FROM alert WHERE owner_email = ? ORDER BY created_at DESC LIMIT 100";
        List<Map<String, Object>> out = new ArrayList<>();
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, email);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) out.add(brief(rs, -1));
            }
        } catch (Exception e) { throw new RuntimeException("Error listando mis reportes", e); }
        return out;
    }

    // ─── internos ────────────────────────────────────────────────────────

    /** Recalcula el estado por umbrales de comunidad + nivel del autor. */
    private void reevaluateStatus(long id, String ownerEmail) {
        Map<String, Object> a = rawAlert(id);
        if (a == null) return;
        String status = (String) a.get("status");
        if (status.equals("resuelta") || status.equals("falsa")) return;
        int confirms = (int) a.get("confirms"), denies = (int) a.get("denies");
        var owner = reporters.find(ownerEmail);
        int ownerScore = owner == null ? 0 : (int) owner.get("score");

        // Desmentida por la comunidad → falsa (y se penaliza al autor una vez).
        if (denies >= 3 && denies > confirms * 2) {
            update("UPDATE alert SET status = 'falsa' WHERE id = ?", id);
            reporters.addScore(ownerEmail, -5);
            return;
        }
        // Confirmada por comunidad (umbral menor si el autor es confiable) → oficial.
        int needed = ownerScore >= 30 ? 2 : ownerScore >= 10 ? 3 : 5;
        if (confirms >= needed && confirms > denies) {
            update("UPDATE alert SET status = 'oficial', official = TRUE WHERE id = ? AND status <> 'crisis'", id);
        }
    }

    private int countNearby(String category, double lat, double lon) {
        String sql = """
                SELECT count(*) FROM alert
                WHERE category = ? AND status IN ('activa','oficial','crisis')
                  AND created_at > now() - make_interval(mins => ?)
                  AND (%s) <= ?
                """.formatted(haversine("lat", "lon", lat, lon));
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, category);
            ps.setInt(2, CRISIS_MIN);
            ps.setDouble(3, CRISIS_KM);
            try (ResultSet rs = ps.executeQuery()) { rs.next(); return rs.getInt(1); }
        } catch (Exception e) { throw new RuntimeException("Error contando cercanas", e); }
    }

    private void escalateNearbyToCrisis(String category, double lat, double lon) {
        String sql = """
                UPDATE alert SET status = 'crisis'
                WHERE category = ? AND status IN ('activa','oficial')
                  AND created_at > now() - make_interval(mins => ?)
                  AND (%s) <= ?
                """.formatted(haversine("lat", "lon", lat, lon));
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, category);
            ps.setInt(2, CRISIS_MIN);
            ps.setDouble(3, CRISIS_KM);
            ps.executeUpdate();
        } catch (Exception e) { throw new RuntimeException("Error escalando a crisis", e); }
    }

    private Map<String, Object> rawAlert(long id) {
        String sql = "SELECT owner_email, lat, lon, radius_km, status, confirms, denies FROM alert WHERE id = ?";
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setLong(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) return null;
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("owner_email", rs.getString("owner_email"));
                m.put("lat", rs.getDouble("lat"));
                m.put("lon", rs.getDouble("lon"));
                m.put("radius_km", rs.getDouble("radius_km"));
                m.put("status", rs.getString("status"));
                m.put("confirms", rs.getInt("confirms"));
                m.put("denies", rs.getInt("denies"));
                return m;
            }
        } catch (Exception e) { throw new RuntimeException("Error leyendo alerta", e); }
    }

    private void upsertVote(Connection c, long id, String email, String v) throws Exception {
        String sql = """
                INSERT INTO alert_vote (alert_id, owner_email, vote) VALUES (?, ?, ?)
                ON CONFLICT (alert_id, owner_email) DO UPDATE SET vote = EXCLUDED.vote, created_at = now()
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setLong(1, id); ps.setString(2, email); ps.setString(3, v); ps.executeUpdate();
        }
    }

    private void applyCounts(Connection c, long id, int dConfirm, int dDeny) throws Exception {
        try (PreparedStatement ps = c.prepareStatement(
                "UPDATE alert SET confirms = GREATEST(0, confirms + ?), denies = GREATEST(0, denies + ?) WHERE id = ?")) {
            ps.setInt(1, dConfirm); ps.setInt(2, dDeny); ps.setLong(3, id); ps.executeUpdate();
        }
    }

    private String myVote(long id, String email) {
        String sql = "SELECT vote FROM alert_vote WHERE alert_id = ? AND owner_email = ?";
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setLong(1, id); ps.setString(2, email);
            try (ResultSet rs = ps.executeQuery()) { return rs.next() ? rs.getString(1) : null; }
        } catch (Exception e) { throw new RuntimeException("Error leyendo voto", e); }
    }

    private boolean isSafe(long id, String email) {
        String sql = "SELECT 1 FROM safe_status WHERE alert_id = ? AND owner_email = ?";
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setLong(1, id); ps.setString(2, email);
            try (ResultSet rs = ps.executeQuery()) { return rs.next(); }
        } catch (Exception e) { throw new RuntimeException("Error leyendo a salvo", e); }
    }

    private int safeCount(long id) {
        try (Connection c = ds.getConnection();
             PreparedStatement ps = c.prepareStatement("SELECT count(*) FROM safe_status WHERE alert_id = ?")) {
            ps.setLong(1, id);
            try (ResultSet rs = ps.executeQuery()) { rs.next(); return rs.getInt(1); }
        } catch (Exception e) { throw new RuntimeException("Error contando a salvo", e); }
    }

    private void update(String sql, long id) {
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setLong(1, id); ps.executeUpdate();
        } catch (Exception e) { throw new RuntimeException("Error actualizando alerta", e); }
    }

    private Map<String, Object> brief(ResultSet rs, double dist) throws java.sql.SQLException {
        Cat cat = Categories.get(rs.getString("category"));
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", rs.getLong("id"));
        m.put("by", rs.getString("pseudonym"));
        m.put("category", cat.slug());
        m.put("label", cat.label());
        m.put("icon", cat.icon());
        m.put("color", cat.color());
        m.put("severity", cat.severity());
        m.put("lat", rs.getDouble("lat"));
        m.put("lon", rs.getDouble("lon"));
        m.put("radiusKm", rs.getDouble("radius_km"));
        m.put("status", rs.getString("status"));
        m.put("official", rs.getBoolean("official"));
        m.put("confirms", rs.getInt("confirms"));
        m.put("denies", rs.getInt("denies"));
        Object created = rs.getObject("created_at", OffsetDateTime.class);
        m.put("createdAt", created == null ? null : created.toString());
        Object exp = rs.getObject("expires_at", OffsetDateTime.class);
        m.put("expiresAt", exp == null ? null : exp.toString());
        m.put("hasPhoto", rs.getString("photo") != null);
        if (dist >= 0) m.put("distanceKm", Math.round(dist * 10) / 10.0);
        return m;
    }

    /** Expresión SQL de Haversine (km) contra un punto fijo. */
    private static String haversine(String latCol, String lonCol, double lat, double lon) {
        return ("6371 * acos(LEAST(1, cos(radians(%f)) * cos(radians(%s)) * "
                + "cos(radians(%s) - radians(%f)) + sin(radians(%f)) * sin(radians(%s))))")
                .formatted(lat, latCol, lonCol, lon, lat, latCol);
    }

    private static double distanceKm(double lat1, double lon1, double lat2, double lon2) {
        double dLat = Math.toRadians(lat2 - lat1), dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
}
