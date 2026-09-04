package com.spider.electrolineras.station;

import com.fasterxml.jackson.databind.JsonNode;
import com.spider.electrolineras.config.Env;
import com.spider.electrolineras.util.Json;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.sql.DataSource;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Iterator;
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

    // ── Sincronización de TODAS las fuentes (idempotente) ──
    public int sync() {
        int n = syncDatosGov();
        if (Env.overpassEnabled()) n += syncOverpass();           // OSM · nacional · sin key
        if (Env.openChargeMapEnabled()) n += syncOpenChargeMap(); // OCM · nacional · con key
        if (Env.tomtomEnabled()) n += syncTomTom();               // TomTom · metros · con key
        try { dedupe(); } catch (Exception e) { log.warn("Dedup falló (se continúa): {}", e.getMessage()); }
        return n;
    }

    // ── Deduplicación por cercanía ──────────────────────────────────
    //   Agrupa estaciones co-ubicadas (distintas fuentes que describen el
    //   mismo punto físico) bajo un "canónico" para no repetir pines. El
    //   listado y el detalle consolidan conectores y fuentes por grupo.
    private static final double DEDUP_METERS = 70.0;

    public void dedupe() {
        record Row(long id, double lat, double lon, String source, int chargers) {}
        List<Row> rows = new ArrayList<>();
        try (Connection c = ds.getConnection(); Statement st = c.createStatement();
             ResultSet rs = st.executeQuery("""
                     SELECT s.id, s.lat, s.lon, s.source,
                       (SELECT count(*) FROM charger ch WHERE ch.station_id = s.id) AS chargers
                     FROM station s WHERE s.lat IS NOT NULL AND s.lon IS NOT NULL""")) {
            while (rs.next()) rows.add(new Row(rs.getLong(1), rs.getDouble(2), rs.getDouble(3),
                    rs.getString(4), rs.getInt(5)));
        } catch (Exception e) { log.warn("dedupe: no se pudo leer estaciones: {}", e.getMessage()); return; }

        int n = rows.size();
        if (n == 0) return;
        int[] parent = new int[n];
        for (int i = 0; i < n; i++) parent[i] = i;

        // Rejilla espacial para comparar solo con vecinos cercanos (no O(n²) real).
        double cell = 0.001; // ~110 m
        Map<Long, List<Integer>> grid = new LinkedHashMap<>();
        for (int i = 0; i < n; i++) {
            long gx = (long) Math.floor(rows.get(i).lat() / cell);
            long gy = (long) Math.floor(rows.get(i).lon() / cell);
            grid.computeIfAbsent(gkey(gx, gy), k -> new ArrayList<>()).add(i);
        }
        for (int i = 0; i < n; i++) {
            Row a = rows.get(i);
            long gx = (long) Math.floor(a.lat() / cell), gy = (long) Math.floor(a.lon() / cell);
            for (long dx = -1; dx <= 1; dx++) for (long dy = -1; dy <= 1; dy++) {
                List<Integer> bucket = grid.get(gkey(gx + dx, gy + dy));
                if (bucket == null) continue;
                for (int j : bucket) {
                    if (j <= i) continue;
                    Row b = rows.get(j);
                    if (haversine(a.lat(), a.lon(), b.lat(), b.lon()) <= DEDUP_METERS) union(parent, i, j);
                }
            }
        }

        // Representante por grupo: más cargadores → fuente más rica → id menor.
        Map<Integer, Integer> best = new LinkedHashMap<>();
        for (int i = 0; i < n; i++) {
            int r = find(parent, i);
            Integer cur = best.get(r);
            if (cur == null) { best.put(r, i); continue; }
            Row cand = rows.get(i), champ = rows.get(cur);
            boolean better = cand.chargers() != champ.chargers()
                    ? cand.chargers() > champ.chargers()
                    : sourcePri(cand.source()) != sourcePri(champ.source())
                        ? sourcePri(cand.source()) > sourcePri(champ.source())
                        : cand.id() < champ.id();
            if (better) best.put(r, i);
        }

        try (Connection c = ds.getConnection();
             PreparedStatement ps = c.prepareStatement("UPDATE station SET canonical_id = ? WHERE id = ?")) {
            for (int i = 0; i < n; i++) {
                long canonical = rows.get(best.get(find(parent, i))).id();
                ps.setLong(1, canonical);
                ps.setLong(2, rows.get(i).id());
                ps.addBatch();
            }
            ps.executeBatch();
        } catch (Exception e) { log.warn("dedupe: no se pudo escribir canónicos: {}", e.getMessage()); return; }
        int groups = best.size();
        log.info("Dedup: {} estaciones → {} grupos ({} duplicados unificados)", n, groups, n - groups);
    }

    private static long gkey(long gx, long gy) { return gx * 1_000_003L + gy; }
    private static int find(int[] p, int i) { while (p[i] != i) { p[i] = p[p[i]]; i = p[i]; } return i; }
    private static void union(int[] p, int a, int b) { p[find(p, a)] = find(p, b); }
    private static double haversine(double la1, double lo1, double la2, double lo2) {
        double R = 6371000, dLa = Math.toRadians(la2 - la1), dLo = Math.toRadians(lo2 - lo1);
        double x = Math.sin(dLa / 2) * Math.sin(dLa / 2)
                + Math.cos(Math.toRadians(la1)) * Math.cos(Math.toRadians(la2)) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
        return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
    }
    /** Prioridad de fuente para elegir el representante (más rica primero). */
    private static int sourcePri(String s) {
        return switch (s == null ? "" : s) {
            case "essa" -> 4;
            case "datos_gov_epm" -> 3;
            case "openchargemap" -> 2;
            case "openstreetmap" -> 1;
            default -> 0;
        };
    }

    // ── Caché de respuestas de APIs externas ────────────────────────
    //   Devuelve la respuesta cacheada si está fresca (TTL); si no, llama a la
    //   API y la guarda. Si la API falla, cae a la caché aunque esté vieja.
    private String cachedGet(String key, java.util.concurrent.Callable<String> fetch) {
        java.time.Duration ttl = java.time.Duration.ofHours(Env.cacheTtlHours());
        String fresh = readCache(key, ttl);
        if (fresh != null) { log.info("Caché HIT {} (sin llamar a la API)", key); return fresh; }
        try {
            String body = fetch.call();
            if (body != null && !body.isBlank()) writeCache(key, body);
            return body;
        } catch (Exception e) {
            String stale = readCache(key, null);
            if (stale != null) { log.warn("API {} falló ({}), uso caché previa", key, e.getMessage()); return stale; }
            log.warn("API {} falló y no hay caché: {}", key, e.getMessage());
            return null;
        }
    }
    private String readCache(String key, java.time.Duration maxAge) {
        try (Connection c = ds.getConnection();
             PreparedStatement ps = c.prepareStatement("SELECT payload, fetched_at FROM api_cache WHERE cache_key = ?")) {
            ps.setString(1, key);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) return null;
                if (maxAge != null) {
                    java.sql.Timestamp ts = rs.getTimestamp("fetched_at");
                    if (ts == null || ts.toInstant().isBefore(java.time.Instant.now().minus(maxAge))) return null;
                }
                return rs.getString("payload");
            }
        } catch (Exception e) { log.debug("readCache {}: {}", key, e.getMessage()); return null; }
    }
    /** Vacía la caché de APIs; el próximo sync vuelve a consultar las fuentes. */
    public int clearCache() {
        try (Connection c = ds.getConnection(); Statement st = c.createStatement()) {
            return st.executeUpdate("DELETE FROM api_cache");
        } catch (Exception e) { throw new RuntimeException("No se pudo limpiar la caché", e); }
    }
    private void writeCache(String key, String payload) {
        try (Connection c = ds.getConnection();
             PreparedStatement ps = c.prepareStatement("""
                     INSERT INTO api_cache (cache_key, payload, fetched_at) VALUES (?, ?, now())
                     ON CONFLICT (cache_key) DO UPDATE SET payload = EXCLUDED.payload, fetched_at = now()""")) {
            ps.setString(1, key);
            ps.setString(2, payload);
            ps.executeUpdate();
        } catch (Exception e) { log.debug("writeCache {}: {}", key, e.getMessage()); }
    }

    // ── OpenStreetMap / Overpass (nacional, crowdsourced, SIN key) ──
    private static final String OVERPASS_UA = "spider-electrolineras/1.0 (https://claude.ai/code)";

    public int syncOverpass() {
        String country = Env.overpassCountry();
        String query = "[out:json][timeout:90];area[\"ISO3166-1\"=\"" + country + "\"][admin_level=2]->.co;"
                + "node[\"amenity\"=\"charging_station\"](area.co);out tags center;";
        String body = "data=" + URLEncoder.encode(query, StandardCharsets.UTF_8);
        String[] endpoints = {
                Env.overpassUrl(),
                "https://overpass.private.coffee/api/interpreter",
                "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
                "https://overpass.kumi.systems/api/interpreter",
        };
        String json = cachedGet("overpass:" + country, () -> {
            for (String url : endpoints) {
                try {
                    HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                            .header("content-type", "application/x-www-form-urlencoded")
                            .header("accept", "application/json")
                            .header("User-Agent", OVERPASS_UA)
                            .timeout(Duration.ofSeconds(95))
                            .POST(HttpRequest.BodyPublishers.ofString(body)).build();
                    HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
                    if (res.statusCode() / 100 != 2 || !res.body().trim().startsWith("{")) {
                        log.warn("Overpass {} en {} → {}", res.statusCode(), url, res.body().substring(0, Math.min(160, res.body().length())));
                        continue;
                    }
                    return res.body();
                } catch (Exception e) {
                    log.warn("Overpass falló en {}: {}", url, e.getMessage());
                }
            }
            throw new RuntimeException("ningún servidor Overpass respondió");
        });
        if (json == null) { log.warn("Overpass: sin datos (ni caché); se omite OSM esta vez"); return 0; }
        try {
            JsonNode root = Json.MAPPER.readTree(json);
            int n = 0;
            for (JsonNode el : root.path("elements")) n += upsertFromOsm(el) ? 1 : 0;
            log.info("Sync OpenStreetMap: {} estaciones procesadas", n);
            return n;
        } catch (Exception e) { log.warn("Overpass parse falló: {}", e.getMessage()); return 0; }
    }

    private boolean upsertFromOsm(JsonNode el) {
        double lat = el.has("lat") ? el.path("lat").asDouble() : el.path("center").path("lat").asDouble(Double.NaN);
        double lon = el.has("lon") ? el.path("lon").asDouble() : el.path("center").path("lon").asDouble(Double.NaN);
        if (Double.isNaN(lat) || Double.isNaN(lon) || (lat == 0 && lon == 0)) return false;
        JsonNode t = el.path("tags");
        String extId = "osm-" + el.path("type").asText("node") + "-" + el.path("id").asLong();
        String operator = firstNonBlank(text(t, "operator"), text(t, "network"), text(t, "brand"));
        String name = firstNonBlank(text(t, "name"), operator, "Estación de carga");
        String city = firstNonBlank(text(t, "addr:city"), text(t, "addr:state"), "");
        String address = (text(t, "addr:street") == null ? "" : text(t, "addr:street")
                + (text(t, "addr:housenumber") == null ? "" : " " + text(t, "addr:housenumber"))).trim();

        // Conectores desde tags socket:*
        List<String[]> sockets = new ArrayList<>(); // [connectorType, powerKw|null]
        double maxKw = 0;
        StringBuilder conn = new StringBuilder();
        for (Iterator<String> it = t.fieldNames(); it.hasNext(); ) {
            String k = it.next();
            if (!k.startsWith("socket:") || k.indexOf(':', 7) > 0) continue; // solo base socket:<tipo>
            String base = k.substring(7);
            String type = socketName(base);
            Double kw = parsePower(text(t, "socket:" + base + ":output"));
            if (kw == null) kw = parsePower(text(t, "maxpower"));
            if (kw != null) maxKw = Math.max(maxKw, kw);
            sockets.add(new String[]{ type, kw == null ? null : String.valueOf(kw) });
            if (conn.length() > 0) conn.append(", ");
            conn.append(type);
        }
        if (conn.length() == 0 && text(t, "socket") != null) conn.append(text(t, "socket"));
        String speed = maxKw >= 50 ? "Rápida" : maxKw >= 22 ? "Semi-rápida" : maxKw > 0 ? "Lenta" : null;

        String sql = """
                INSERT INTO station (source, external_id, name, operator, city, address, lat, lon,
                                     connectors, speed, hours, website, source_active, raw, updated_at)
                VALUES ('openstreetmap', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?, now())
                ON CONFLICT (source, external_id) DO UPDATE SET
                    name = EXCLUDED.name, operator = EXCLUDED.operator, city = EXCLUDED.city,
                    address = EXCLUDED.address, lat = EXCLUDED.lat, lon = EXCLUDED.lon,
                    connectors = EXCLUDED.connectors, speed = EXCLUDED.speed, hours = EXCLUDED.hours,
                    website = EXCLUDED.website, raw = EXCLUDED.raw, updated_at = now()
                RETURNING id
                """;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, extId);
            ps.setString(2, name);
            ps.setString(3, operator);
            ps.setString(4, city);
            ps.setString(5, address.isBlank() ? null : address);
            ps.setDouble(6, lat);
            ps.setDouble(7, lon);
            ps.setString(8, conn.length() > 0 ? conn.toString() : null);
            ps.setString(9, speed);
            ps.setString(10, text(t, "opening_hours"));
            ps.setString(11, firstBlankNull(text(t, "website"), text(t, "contact:website")));
            ps.setString(12, el.toString());
            long stationId;
            try (ResultSet rs = ps.executeQuery()) { rs.next(); stationId = rs.getLong(1); }
            int idx = 0;
            for (String[] s : sockets) {
                idx++;
                Double kw = s[1] == null ? null : Double.parseDouble(s[1]);
                insertCharger(c, stationId, s[0] + " #" + idx, s[0], kw);
            }
            return true;
        } catch (Exception e) { log.debug("Nodo OSM ignorado: {}", e.getMessage()); return false; }
    }

    private static String socketName(String base) {
        switch (base) {
            case "type2": case "type2_cable": return "Tipo 2";
            case "type2_combo": case "ccs": return "CCS2";
            case "chademo": return "CHAdeMO";
            case "type1": case "type1_cable": case "type1_combo": return "Tipo 1";
            case "tesla_supercharger": case "tesla_supercharger_ccs": return "Tesla";
            case "gb_dc": case "gb_ac": return "GB/T";
            case "schuko": return "Schuko";
            default: return base;
        }
    }
    private static Double parsePower(String s) {
        if (s == null) return null;
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("([0-9]+(?:[.,][0-9]+)?)").matcher(s);
        try { return m.find() ? Double.parseDouble(m.group(1).replace(",", ".")) : null; } catch (Exception e) { return null; }
    }
    private static String firstBlankNull(String... xs) { for (String x : xs) if (x != null && !x.isBlank()) return x; return null; }

    // ── datos.gov.co (EPM · Antioquia) ──
    public int syncDatosGov() {
        String url = Env.datosGovBase().replaceAll("/+$", "") + "/" + Env.datosGovResource() + ".json?$limit=5000";
        String token = Env.datosGovAppToken();
        String json = cachedGet("datos_gov:" + Env.datosGovResource(), () -> {
            HttpRequest.Builder req = HttpRequest.newBuilder(URI.create(url))
                    .header("accept", "application/json").timeout(Duration.ofSeconds(30)).GET();
            if (!token.isBlank()) req.header("X-App-Token", token);
            HttpResponse<String> res = http.send(req.build(), HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() / 100 != 2) throw new RuntimeException("HTTP " + res.statusCode());
            return res.body();
        });
        if (json == null) return 0;
        try {
            JsonNode rows = Json.MAPPER.readTree(json);
            int n = 0;
            for (JsonNode row : rows) n += upsertFromGov(row) ? 1 : 0;
            log.info("Sync datos.gov.co: {} estaciones procesadas", n);
            return n;
        } catch (Exception e) {
            log.warn("datos.gov.co parse falló (se continúa): {}", e.getMessage());
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

    // ── Open Charge Map (cobertura nacional, crowdsourced) ──
    public int syncOpenChargeMap() {
        String key = Env.openChargeMapKey();
        String url = "https://api.openchargemap.io/v3/poi?output=json&countrycode=" + Env.openChargeMapCountry()
                + "&maxresults=" + Env.openChargeMapMax() + "&key=" + key;
        String json = cachedGet("ocm:" + Env.openChargeMapCountry(), () -> {
            HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                    .header("accept", "application/json").header("X-API-Key", key)
                    .timeout(Duration.ofSeconds(40)).GET().build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() / 100 != 2) throw new RuntimeException("HTTP " + res.statusCode());
            return res.body();
        });
        if (json == null) return 0;
        try {
            JsonNode pois = Json.MAPPER.readTree(json);
            int n = 0;
            for (JsonNode poi : pois) n += upsertFromOcm(poi) ? 1 : 0;
            log.info("Sync Open Charge Map: {} estaciones procesadas", n);
            return n;
        } catch (Exception e) {
            log.warn("OCM parse falló (se continúa): {}", e.getMessage());
            return 0;
        }
    }

    private boolean upsertFromOcm(JsonNode poi) {
        JsonNode ai = poi.path("AddressInfo");
        if (ai.path("Latitude").isMissingNode() || ai.path("Longitude").isMissingNode()) return false;
        double lat = ai.path("Latitude").asDouble();
        double lon = ai.path("Longitude").asDouble();
        if (lat == 0 && lon == 0) return false;
        String extId = "ocm-" + poi.path("ID").asLong();
        String name = firstNonBlank(text(ai, "Title"), "Estación de carga");
        String city = firstNonBlank(text(ai, "Town"), text(ai, "StateOrProvince"), "");
        String address = text(ai, "AddressLine1");
        String operator = text(poi.path("OperatorInfo"), "Title");

        StringBuilder conn = new StringBuilder();
        double maxKw = 0;
        for (JsonNode cn : poi.path("Connections")) {
            String t = text(cn.path("ConnectionType"), "Title");
            if (t != null && !t.isBlank()) { if (conn.length() > 0) conn.append(", "); conn.append(t); }
            if (cn.path("PowerKW").isNumber()) maxKw = Math.max(maxKw, cn.path("PowerKW").asDouble());
        }
        String speed = maxKw >= 50 ? "Rápida" : maxKw >= 22 ? "Semi-rápida" : maxKw > 0 ? "Lenta" : null;
        boolean operational = poi.path("StatusType").path("IsOperational").asBoolean(true);

        String sql = """
                INSERT INTO station (source, external_id, name, operator, city, address, lat, lon,
                                     connectors, speed, hours, website, source_active, raw, updated_at)
                VALUES ('openchargemap', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, now())
                ON CONFLICT (source, external_id) DO UPDATE SET
                    name = EXCLUDED.name, operator = EXCLUDED.operator, city = EXCLUDED.city,
                    address = EXCLUDED.address, lat = EXCLUDED.lat, lon = EXCLUDED.lon,
                    connectors = EXCLUDED.connectors, speed = EXCLUDED.speed,
                    source_active = EXCLUDED.source_active, raw = EXCLUDED.raw, updated_at = now()
                RETURNING id
                """;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, extId);
            ps.setString(2, name);
            ps.setString(3, operator);
            ps.setString(4, city);
            ps.setString(5, address);
            ps.setDouble(6, lat);
            ps.setDouble(7, lon);
            ps.setString(8, conn.length() > 0 ? conn.toString() : null);
            ps.setString(9, speed);
            ps.setBoolean(10, operational);
            ps.setString(11, poi.toString());
            long stationId;
            try (ResultSet rs = ps.executeQuery()) { rs.next(); stationId = rs.getLong(1); }
            // cargadores con conector + potencia explícitos
            int idx = 0;
            for (JsonNode cn : poi.path("Connections")) {
                idx++;
                String t = firstNonBlank(text(cn.path("ConnectionType"), "Title"), "Conector " + idx);
                Double kw = cn.path("PowerKW").isNumber() ? cn.path("PowerKW").asDouble() : null;
                insertCharger(c, stationId, t + " #" + idx, normalizeConnector(t), kw);
            }
            return true;
        } catch (Exception e) {
            log.debug("POI OCM ignorado: {}", e.getMessage());
            return false;
        }
    }

    // ── TomTom (POI EV · con key) ───────────────────────────────────
    //   Search 2.0 no da >100 por consulta ni cobertura nacional en una sola
    //   llamada, así que se recorre un MOSAICO de áreas metropolitanas (radio
    //   50 km, categoría 7309 = Electric Vehicle Station). Cubre donde de hecho
    //   hay cargadores en Colombia sin agotar el free tier (2.500/día).
    private static final double[][] TOMTOM_TILES = {
            {4.6533, -74.0836},  // Bogotá
            {6.2442, -75.5812},  // Medellín / Aburrá
            {3.4516, -76.5320},  // Cali
            {10.9685, -74.7813}, // Barranquilla
            {10.3910, -75.4794}, // Cartagena
            {7.1193, -73.1227},  // Bucaramanga (área metropolitana)
            {7.8939, -72.4967},  // Cúcuta
            {4.8133, -75.6961},  // Pereira / Eje Cafetero
            {5.0703, -75.5138},  // Manizales
            {4.4389, -75.2322},  // Ibagué
            {4.1420, -73.6266},  // Villavicencio
            {11.2408, -74.1990}, // Santa Marta
            {1.2136, -77.2811},  // Pasto
            {2.9273, -75.2819},  // Neiva
            {4.5339, -75.6811},  // Armenia
    };

    public int syncTomTom() {
        String key = Env.tomtomKey();
        int total = 0;
        for (double[] tile : TOMTOM_TILES) {
            final String url = "https://api.tomtom.com/search/2/nearbySearch/.json?key=" + URLEncoder.encode(key, StandardCharsets.UTF_8)
                    + "&lat=" + tile[0] + "&lon=" + tile[1] + "&radius=50000&categorySet=7309&limit=100&countrySet=CO";
            String json = cachedGet("tomtom:" + tile[0] + "," + tile[1], () -> {
                HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                        .header("accept", "application/json").timeout(Duration.ofSeconds(30)).GET().build();
                HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
                if (res.statusCode() / 100 != 2)
                    throw new RuntimeException("HTTP " + res.statusCode() + ": " + res.body().substring(0, Math.min(160, res.body().length())));
                return res.body();
            });
            if (json == null) continue;
            try {
                JsonNode root = Json.MAPPER.readTree(json);
                for (JsonNode r : root.path("results")) total += upsertFromTomTom(r) ? 1 : 0;
            } catch (Exception e) {
                log.warn("TomTom parse falló en tile {},{}: {}", tile[0], tile[1], e.getMessage());
            }
        }
        log.info("Sync TomTom: {} estaciones procesadas", total);
        return total;
    }

    private boolean upsertFromTomTom(JsonNode r) {
        JsonNode pos = r.path("position");
        if (pos.path("lat").isMissingNode() || pos.path("lon").isMissingNode()) return false;
        double lat = pos.path("lat").asDouble(), lon = pos.path("lon").asDouble();
        if (lat == 0 && lon == 0) return false;
        String extId = "tomtom-" + firstNonBlank(text(r, "id"), lat + "," + lon);
        JsonNode poi = r.path("poi");
        JsonNode addr = r.path("address");
        String name = firstNonBlank(text(poi, "name"), "Estación de carga");
        String operator = poi.path("brands").isArray() && poi.path("brands").size() > 0
                ? text(poi.path("brands").get(0), "name") : null;
        String city = firstNonBlank(text(addr, "municipality"), text(addr, "countrySubdivision"), "");
        String address = text(addr, "freeformAddress");

        StringBuilder conn = new StringBuilder();
        double maxKw = 0;
        List<String[]> connectors = new ArrayList<>(); // [type, kw|null]
        for (JsonNode cn : r.path("chargingPark").path("connectors")) {
            String type = tomtomConnector(text(cn, "connectorType"));
            Double kw = cn.path("ratedPowerKW").isNumber() ? cn.path("ratedPowerKW").asDouble() : null;
            if (kw != null) maxKw = Math.max(maxKw, kw);
            connectors.add(new String[]{ type, kw == null ? null : String.valueOf(kw) });
            if (conn.length() > 0) conn.append(", ");
            conn.append(type);
        }
        String speed = maxKw >= 50 ? "Rápida" : maxKw >= 22 ? "Semi-rápida" : maxKw > 0 ? "Lenta" : null;

        String sql = """
                INSERT INTO station (source, external_id, name, operator, city, address, lat, lon,
                                     connectors, speed, hours, website, source_active, raw, updated_at)
                VALUES ('tomtom', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, TRUE, ?, now())
                ON CONFLICT (source, external_id) DO UPDATE SET
                    name = EXCLUDED.name, operator = EXCLUDED.operator, city = EXCLUDED.city,
                    address = EXCLUDED.address, lat = EXCLUDED.lat, lon = EXCLUDED.lon,
                    connectors = EXCLUDED.connectors, speed = EXCLUDED.speed,
                    raw = EXCLUDED.raw, updated_at = now()
                RETURNING id
                """;
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, extId);
            ps.setString(2, name);
            ps.setString(3, operator);
            ps.setString(4, city);
            ps.setString(5, address);
            ps.setDouble(6, lat);
            ps.setDouble(7, lon);
            ps.setString(8, conn.length() > 0 ? conn.toString() : null);
            ps.setString(9, speed);
            ps.setString(10, r.toString());
            long stationId;
            try (ResultSet rs = ps.executeQuery()) { rs.next(); stationId = rs.getLong(1); }
            int idx = 0;
            for (String[] s : connectors) {
                idx++;
                Double kw = s[1] == null ? null : Double.parseDouble(s[1]);
                insertCharger(c, stationId, s[0] + " #" + idx, s[0], kw);
            }
            return true;
        } catch (Exception e) { log.debug("POI TomTom ignorado: {}", e.getMessage()); return false; }
    }

    /** Mapea los tipos de conector de TomTom a nuestros estándares. */
    private static String tomtomConnector(String t) {
        if (t == null) return "Conector";
        String u = t.toUpperCase();
        if (u.contains("CCS") || u.contains("COMBO")) return "CCS2";
        if (u.contains("CHADEMO")) return "CHAdeMO";
        if (u.contains("TYPE2") || u.contains("TYPE 2")) return "Tipo 2";
        if (u.contains("TYPE1") || u.contains("TYPE 1")) return "Tipo 1";
        if (u.contains("GBT") || u.contains("GB/T")) return "GB/T";
        if (u.contains("TESLA")) return "Tesla";
        if (u.contains("HOUSEHOLD") || u.contains("SCHUKO")) return "Schuko";
        return t;
    }

    private void insertCharger(Connection c, long stationId, String label, String connectorType, Double powerKw) throws Exception {
        try (PreparedStatement ps = c.prepareStatement("""
                INSERT INTO charger (station_id, label, connector_type, power_kw)
                VALUES (?, ?, ?, ?) ON CONFLICT (station_id, label) DO NOTHING""")) {
            ps.setLong(1, stationId);
            ps.setString(2, label);
            ps.setString(3, connectorType);
            if (powerKw == null) ps.setNull(4, java.sql.Types.NUMERIC); else ps.setBigDecimal(4, java.math.BigDecimal.valueOf(powerKw));
            ps.executeUpdate();
        }
    }

    // ── Listado para el mapa (consolidado por canónico) ──
    //   Cada pin es un GRUPO de estaciones co-ubicadas: se unen conectores y
    //   fuentes, se toma la mejor velocidad y los campos visibles del canónico.
    public List<Map<String, Object>> list() {
        return list(null, null, null, null, 0);
    }

    /**
     * Listado consolidado, opcionalmente acotado a un bounding box (para carga
     * por área visible del mapa) y con un límite de filas (tope de seguridad).
     * Cualquiera de los límites en null desactiva el filtro/tope.
     */
    public List<Map<String, Object>> list(Double minLat, Double minLon, Double maxLat, Double maxLon, int limit) {
        boolean bbox = minLat != null && minLon != null && maxLat != null && maxLon != null;
        StringBuilder sql = new StringBuilder("""
                SELECT s.id, COALESCE(s.canonical_id, s.id) AS cluster,
                       s.name, s.operator, s.city, s.address, s.lat, s.lon, s.connectors, s.speed, s.source,
                  (SELECT r.status FROM status_report r WHERE r.station_id = s.id AND r.charger_id IS NULL
                     ORDER BY r.created_at DESC LIMIT 1) AS community_status,
                  (SELECT count(*) FROM station_comment k WHERE k.station_id = s.id) AS comments,
                  (SELECT count(*) FROM charger ch WHERE ch.station_id = s.id) AS chargers
                FROM station s
                WHERE s.lat IS NOT NULL AND s.lon IS NOT NULL
                """);
        if (bbox) sql.append(" AND s.lat BETWEEN ? AND ? AND s.lon BETWEEN ? AND ?");
        sql.append(" ORDER BY s.city, s.name");
        if (limit > 0) sql.append(" LIMIT ").append(limit);
        Map<Long, Map<String, Object>> byCluster = new LinkedHashMap<>();
        Map<Long, Set<String>> connByCluster = new LinkedHashMap<>();
        Map<Long, Set<String>> srcByCluster = new LinkedHashMap<>();
        Map<Long, int[]> sumByCluster = new LinkedHashMap<>();   // [comments, chargers]
        Map<Long, String> speedByCluster = new LinkedHashMap<>();
        try (Connection c = ds.getConnection(); PreparedStatement ps = c.prepareStatement(sql.toString())) {
            if (bbox) {
                ps.setDouble(1, minLat); ps.setDouble(2, maxLat);
                ps.setDouble(3, minLon); ps.setDouble(4, maxLon);
            }
            ResultSet rs = ps.executeQuery();
            while (rs.next()) {
                long cluster = rs.getLong("cluster");
                boolean isCanon = rs.getLong("id") == cluster;
                Map<String, Object> m = byCluster.get(cluster);
                if (m == null || isCanon) {
                    if (m == null) { m = new LinkedHashMap<>(); byCluster.put(cluster, m); }
                    if (isCanon || m.get("_canon") == null) {
                        m.put("id", cluster);
                        m.put("name", rs.getString("name"));
                        m.put("operator", nz(rs.getString("operator")));
                        m.put("city", nz(rs.getString("city")));
                        m.put("address", nz(rs.getString("address")));
                        m.put("lat", rs.getObject("lat"));
                        m.put("lon", rs.getObject("lon"));
                        m.put("communityStatus", rs.getString("community_status"));
                        if (isCanon) m.put("_canon", Boolean.TRUE);
                    }
                }
                for (String tok : splitConnectors(rs.getString("connectors")))
                    connByCluster.computeIfAbsent(cluster, k -> new LinkedHashSet<>()).add(tok);
                if (rs.getString("source") != null)
                    srcByCluster.computeIfAbsent(cluster, k -> new LinkedHashSet<>()).add(rs.getString("source"));
                int[] s = sumByCluster.computeIfAbsent(cluster, k -> new int[2]);
                s[0] += rs.getInt("comments"); s[1] += rs.getInt("chargers");
                speedByCluster.merge(cluster, nz(rs.getString("speed")), StationService::betterSpeed);
            }
        } catch (Exception e) { throw new RuntimeException("Error listando estaciones", e); }

        List<Map<String, Object>> out = new ArrayList<>(byCluster.size());
        for (Map.Entry<Long, Map<String, Object>> e : byCluster.entrySet()) {
            long cl = e.getKey(); Map<String, Object> m = e.getValue();
            m.remove("_canon");
            m.put("connectors", String.join(", ", connByCluster.getOrDefault(cl, Set.of())));
            m.put("speed", nz(speedByCluster.get(cl)));
            m.put("sources", new ArrayList<>(srcByCluster.getOrDefault(cl, Set.of())));
            int[] s = sumByCluster.getOrDefault(cl, new int[2]);
            m.put("comments", s[0]);
            m.put("chargers", s[1]);
            out.add(m);
        }
        return out;
    }

    /** Trocea el texto de conectores en estándares normalizados y sin repetir. */
    private static Set<String> splitConnectors(String connectors) {
        Set<String> out = new LinkedHashSet<>();
        if (connectors == null || connectors.isBlank()) return out;
        for (String t : connectors.split("[,/;]| y ")) {
            String label = t.trim().replaceAll("\\s+", " ");
            if (label.length() >= 2) out.add(normalizeConnector(label));
        }
        return out;
    }
    private static final List<String> SPEED_ORDER = List.of("Lenta", "Semi-rápida", "Rápida");
    /** Devuelve la velocidad más alta entre dos (Rápida > Semi-rápida > Lenta). */
    private static String betterSpeed(String a, String b) {
        return SPEED_ORDER.indexOf(a) >= SPEED_ORDER.indexOf(b) ? a : b;
    }

    // ── Totales del catálogo (para saber qué cargamos) ──
    public Map<String, Object> stats() {
        Map<String, Object> out = new LinkedHashMap<>();
        List<Map<String, Object>> bySource = new ArrayList<>();
        long total = 0;
        try (Connection c = ds.getConnection(); Statement st = c.createStatement()) {
            try (ResultSet rs = st.executeQuery("SELECT source, count(*) AS n FROM station GROUP BY source ORDER BY n DESC")) {
                while (rs.next()) { bySource.add(Map.of("source", rs.getString("source"), "count", rs.getLong("n"))); total += rs.getLong("n"); }
            }
            long cities = 0;
            try (ResultSet rs = st.executeQuery("SELECT count(DISTINCT city) AS n FROM station WHERE city <> ''")) { if (rs.next()) cities = rs.getLong("n"); }
            out.put("total", total);
            out.put("bySource", bySource);
            out.put("cities", cities);
        } catch (Exception e) { throw new RuntimeException("Error en stats", e); }
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
            // cargadores con su último estado — de TODO el grupo (canónico + miembros)
            List<Map<String, Object>> chargers = new ArrayList<>();
            try (PreparedStatement ps = c.prepareStatement("""
                    SELECT ch.id, ch.label, ch.connector_type, ch.power_kw,
                      (SELECT r.status FROM status_report r WHERE r.charger_id = ch.id ORDER BY r.created_at DESC LIMIT 1) AS status,
                      (SELECT r.created_at FROM status_report r WHERE r.charger_id = ch.id ORDER BY r.created_at DESC LIMIT 1) AS status_at
                    FROM charger ch JOIN station s ON s.id = ch.station_id
                    WHERE s.id = ? OR s.canonical_id = ?
                    ORDER BY ch.connector_type, ch.power_kw DESC NULLS LAST, ch.label""")) {
                ps.setLong(1, id);
                ps.setLong(2, id);
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

            // Fuentes y conectores consolidados del grupo (canónico + miembros).
            Set<String> sources = new LinkedHashSet<>();
            Set<String> allConn = new LinkedHashSet<>();
            try (PreparedStatement ps = c.prepareStatement(
                    "SELECT source, connectors FROM station WHERE id = ? OR canonical_id = ?")) {
                ps.setLong(1, id);
                ps.setLong(2, id);
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        if (rs.getString("source") != null) sources.add(rs.getString("source"));
                        allConn.addAll(splitConnectors(rs.getString("connectors")));
                    }
                }
            }
            out.put("sources", new ArrayList<>(sources));
            if (!allConn.isEmpty()) out.put("connectors", String.join(", ", allConn));
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
