package com.spider.electrolineras.station;

import com.fasterxml.jackson.databind.JsonNode;
import com.spider.electrolineras.config.Env;
import com.spider.electrolineras.util.Json;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.sql.DataSource;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Catálogo de estaciones. La base se sincroniza desde datos abiertos del
 * gobierno (datos.gov.co / Socrata). El estado en vivo no está en datos
 * abiertos; se resuelve con reportes de la comunidad (ver ReportService).
 */
public class StationService {

    private static final Logger log = LoggerFactory.getLogger(StationService.class);
    private final DataSource ds;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();

    public StationService(DataSource ds) { this.ds = ds; }

    // ── Sincronización desde datos.gov.co (idempotente) ──
    public int sync() {
        String url = Env.datosGovBase().replaceAll("/+$", "") + "/" + Env.datosGovResource() + ".json?$limit=5000";
        String token = Env.datosGovAppToken();
        try {
            HttpRequest.Builder req = HttpRequest.newBuilder(URI.create(url))
                    .header("accept", "application/json").timeout(Duration.ofSeconds(30)).GET();
            if (!token.isBlank()) req.header("X-App-Token", token);
            HttpResponse<String> res = http.send(req.build(), HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() / 100 != 2) {
                log.warn("datos.gov.co {} → {}", res.statusCode(), res.body());
                return 0;
            }
            JsonNode rows = Json.MAPPER.readTree(res.body());
            int n = 0;
            for (JsonNode row : rows) n += upsertFromGov(row) ? 1 : 0;
            log.info("Sync datos.gov.co: {} estaciones procesadas", n);
            return n;
        } catch (Exception e) {
            log.warn("Sync falló (se continúa): {}", e.getMessage());
            return 0;
        }
    }

    private boolean upsertFromGov(JsonNode row) {
        String coords = text(row, "coordenadas");           // "6.17938000,-75.44224100"
        double[] ll = parseCoords(coords, text(row, "latitud"), text(row, "longitud"));
        if (ll == null) return false;
        String extId = coords != null && !coords.isBlank() ? coords : (text(row, "estaci_n") + "|" + text(row, "ciudad"));
        String name = firstNonBlank(text(row, "estaci_n"), text(row, "tipo_de_estacion"), "Estación de carga");
        String connectors = text(row, "est_ndar_cargador");
        String website = row.path("ubicaci_n_o_sitio_web").path("url").asText(null);

        String sql = """
                INSERT INTO station (source, external_id, name, operator, city, address, lat, lon,
                                     connectors, speed, hours, website, source_active, raw, updated_at)
                VALUES ('datos_gov_epm', ?, ?, 'EPM', ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?, now())
                ON CONFLICT (source, external_id) DO UPDATE SET
                    name = EXCLUDED.name, city = EXCLUDED.city, address = EXCLUDED.address,
                    lat = EXCLUDED.lat, lon = EXCLUDED.lon, connectors = EXCLUDED.connectors,
                    speed = EXCLUDED.speed, hours = EXCLUDED.hours, website = EXCLUDED.website,
                    raw = EXCLUDED.raw, updated_at = now()
                RETURNING id
                """;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, extId);
            ps.setString(2, name);
            ps.setString(3, text(row, "ciudad"));
            ps.setString(4, text(row, "direcci_n"));
            ps.setDouble(5, ll[0]);
            ps.setDouble(6, ll[1]);
            ps.setString(7, connectors);
            ps.setString(8, text(row, "tipo"));
            ps.setString(9, text(row, "horario"));
            ps.setString(10, website);
            ps.setString(11, row.toString());
            long stationId;
            try (ResultSet rs = ps.executeQuery()) { rs.next(); stationId = rs.getLong(1); }
            ensureChargers(c, stationId, connectors);
            return true;
        } catch (Exception e) {
            log.debug("Fila ignorada: {}", e.getMessage());
            return false;
        }
    }

    /** Crea un cargador por cada estándar de conector detectado (no duplica). */
    private void ensureChargers(Connection c, long stationId, String connectors) throws Exception {
        if (connectors == null || connectors.isBlank()) return;
        Set<String> tokens = new LinkedHashSet<>();
        for (String t : connectors.split("[,/;\\-]| y ")) {
            String label = t.trim().replaceAll("\\s+", " ");
            if (label.length() >= 2) tokens.add(label);
        }
        String sql = """
                INSERT INTO charger (station_id, label, connector_type)
                VALUES (?, ?, ?) ON CONFLICT (station_id, label) DO NOTHING
                """;
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            for (String label : tokens) {
                ps.setLong(1, stationId);
                ps.setString(2, label);
                ps.setString(3, normalizeConnector(label));
                ps.addBatch();
            }
            ps.executeBatch();
        }
    }

    static String normalizeConnector(String s) {
        String u = s.toUpperCase();
        if (u.contains("CCS") || u.contains("COMBO")) return "CCS2";
        if (u.contains("CHADEMO")) return "CHAdeMO";
        if (u.contains("MENNEKES") || u.contains("TIPO 2") || u.contains("TYPE 2") || u.contains("EUROPEO")) return "Tipo 2";
        if (u.contains("GBT") || u.contains("GB/T") || u.contains("GB T")) return "GB/T";
        if (u.contains("TIPO 1") || u.contains("TYPE 1") || u.contains("J1772")) return "Tipo 1";
        return s;
    }

    // ── Listado para el mapa (ligero) ──
    public List<Map<String, Object>> list() {
        String sql = """
                SELECT s.id, s.name, s.operator, s.city, s.address, s.lat, s.lon, s.connectors, s.speed,
                  (SELECT r.status FROM status_report r WHERE r.station_id = s.id AND r.charger_id IS NULL
                     ORDER BY r.created_at DESC LIMIT 1) AS community_status,
                  (SELECT count(*) FROM station_comment k WHERE k.station_id = s.id) AS comments,
                  (SELECT count(*) FROM charger ch WHERE ch.station_id = s.id) AS chargers
                FROM station s
                WHERE s.lat IS NOT NULL AND s.lon IS NOT NULL
                ORDER BY s.city, s.name
                """;
        List<Map<String, Object>> out = new ArrayList<>();
        try (Connection c = ds.getConnection(); Statement st = c.createStatement(); ResultSet rs = st.executeQuery(sql)) {
            while (rs.next()) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("id", rs.getLong("id"));
                m.put("name", rs.getString("name"));
                m.put("operator", nz(rs.getString("operator")));
                m.put("city", nz(rs.getString("city")));
                m.put("address", nz(rs.getString("address")));
                m.put("lat", rs.getObject("lat"));
                m.put("lon", rs.getObject("lon"));
                m.put("connectors", nz(rs.getString("connectors")));
                m.put("speed", nz(rs.getString("speed")));
                m.put("communityStatus", rs.getString("community_status"));
                m.put("comments", rs.getInt("comments"));
                m.put("chargers", rs.getInt("chargers"));
                out.add(m);
            }
        } catch (Exception e) { throw new RuntimeException("Error listando estaciones", e); }
        return out;
    }

    // ── Detalle de una estación (con cargadores y su último estado) ──
    public Map<String, Object> detail(long id) {
        Map<String, Object> out = new LinkedHashMap<>();
        try (Connection c = ds.getConnection()) {
            try (PreparedStatement ps = c.prepareStatement("SELECT * FROM station WHERE id = ?")) {
                ps.setLong(1, id);
                try (ResultSet rs = ps.executeQuery()) {
                    if (!rs.next()) return null;
                    out.put("id", rs.getLong("id"));
                    out.put("name", rs.getString("name"));
                    out.put("operator", nz(rs.getString("operator")));
                    out.put("city", nz(rs.getString("city")));
                    out.put("address", nz(rs.getString("address")));
                    out.put("lat", rs.getObject("lat"));
                    out.put("lon", rs.getObject("lon"));
                    out.put("connectors", nz(rs.getString("connectors")));
                    out.put("speed", nz(rs.getString("speed")));
                    out.put("hours", nz(rs.getString("hours")));
                    out.put("website", rs.getString("website"));
                    out.put("source", rs.getString("source"));
                    out.put("updatedAt", String.valueOf(rs.getObject("updated_at")));
                }
            }
            // estado comunitario de la estación
            try (PreparedStatement ps = c.prepareStatement(
                    "SELECT status, created_at FROM status_report WHERE station_id = ? AND charger_id IS NULL ORDER BY created_at DESC LIMIT 1")) {
                ps.setLong(1, id);
                try (ResultSet rs = ps.executeQuery()) {
                    if (rs.next()) { out.put("communityStatus", rs.getString("status"));
                        out.put("communityStatusAt", String.valueOf(rs.getObject("created_at"))); }
                    else out.put("communityStatus", null);
                }
            }
            // cargadores con su último estado
            List<Map<String, Object>> chargers = new ArrayList<>();
            try (PreparedStatement ps = c.prepareStatement("""
                    SELECT ch.id, ch.label, ch.connector_type, ch.power_kw,
                      (SELECT r.status FROM status_report r WHERE r.charger_id = ch.id ORDER BY r.created_at DESC LIMIT 1) AS status,
                      (SELECT r.created_at FROM status_report r WHERE r.charger_id = ch.id ORDER BY r.created_at DESC LIMIT 1) AS status_at
                    FROM charger ch WHERE ch.station_id = ? ORDER BY ch.label""")) {
                ps.setLong(1, id);
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        Map<String, Object> ch = new LinkedHashMap<>();
                        ch.put("id", rs.getLong("id"));
                        ch.put("label", rs.getString("label"));
                        ch.put("connectorType", nz(rs.getString("connector_type")));
                        ch.put("powerKw", rs.getObject("power_kw"));
                        ch.put("status", rs.getString("status"));
                        ch.put("statusAt", rs.getObject("status_at") == null ? null : String.valueOf(rs.getObject("status_at")));
                        chargers.add(ch);
                    }
                }
            }
            out.put("chargers", chargers);
        } catch (Exception e) { throw new RuntimeException("Error consultando estación", e); }
        return out;
    }

    // ── Helpers ──
    private static double[] parseCoords(String coords, String lat, String lon) {
        try {
            if (coords != null && coords.contains(",")) {
                String[] p = coords.split(",", 2);
                return new double[]{ Double.parseDouble(p[0].trim()), Double.parseDouble(p[1].trim()) };
            }
            if (lat != null && lon != null) {
                return new double[]{ Double.parseDouble(lat.replace(",", ".").trim()),
                        Double.parseDouble(lon.replace(",", ".").trim()) };
            }
        } catch (Exception ignore) { }
        return null;
    }
    private static String text(JsonNode n, String f) {
        JsonNode v = n.path(f);
        return v.isMissingNode() || v.isNull() ? null : v.asText();
    }
    private static String firstNonBlank(String... xs) {
        for (String x : xs) if (x != null && !x.isBlank()) return x;
        return "";
    }
    private static String nz(String s) { return s == null ? "" : s; }
}
