package com.spider.electrolineras.route;

import com.fasterxml.jackson.databind.JsonNode;
import com.spider.electrolineras.util.Json;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Geocodificación (Nominatim/OSM) y ruteo por carretera (OSRM). Ambos son
 * servicios públicos gratuitos sin API key. Se consumen server-side para
 * respetar sus políticas (User-Agent) y evitar CORS en el navegador.
 */
public class RoutingService {

    private static final Logger log = LoggerFactory.getLogger(RoutingService.class);
    private static final String UA = "spider-electrolineras/1.0 (https://claude.ai/code)";
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();

    /** Busca lugares por texto (limitado a Colombia). */
    public List<Map<String, Object>> geocode(String q) {
        String url = "https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=0"
                + "&countrycodes=co&limit=6&q=" + URLEncoder.encode(q, StandardCharsets.UTF_8);
        List<Map<String, Object>> out = new ArrayList<>();
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                    .header("User-Agent", UA).header("accept", "application/json")
                    .timeout(Duration.ofSeconds(15)).GET().build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() / 100 != 2) { log.warn("Nominatim {}", res.statusCode()); return out; }
            for (JsonNode r : Json.MAPPER.readTree(res.body())) {
                out.add(Map.of(
                        "name", r.path("display_name").asText(""),
                        "lat", Double.parseDouble(r.path("lat").asText("0")),
                        "lon", Double.parseDouble(r.path("lon").asText("0"))));
            }
        } catch (Exception e) { log.warn("Geocode falló: {}", e.getMessage()); }
        return out;
    }

    /** Ruta por carretera entre dos puntos (la principal). */
    public Map<String, Object> route(double fromLat, double fromLon, double toLat, double toLon) {
        List<Map<String, Object>> all = routes(fromLat, fromLon, toLat, toLon);
        return all.isEmpty() ? new LinkedHashMap<>() : all.get(0);
    }

    /** Varias rutas alternativas por carretera. Cada una: distancia, duración y geometría [lat,lon]. */
    public List<Map<String, Object>> routes(double fromLat, double fromLon, double toLat, double toLon) {
        List<Map<String, Object>> out = new ArrayList<>();
        // 1) Alternativas nativas de OSRM (a veces devuelve solo 1).
        JsonNode root = osrm(fromLon + "," + fromLat + ";" + toLon + "," + toLat, true);
        if (root != null) for (JsonNode r : root.path("routes")) {
            Map<String, Object> m = parseRoute(r);
            if (m != null) out.add(m);
        }
        // 2) Si hay menos de 3, sintetizamos rutas por un CORREDOR distinto
        //    (enrutando por un punto desviado perpendicular al trayecto).
        if (out.size() < 3) {
            double mLat = (fromLat + toLat) / 2, mLon = (fromLon + toLon) / 2;
            double dLat = toLat - fromLat, dLon = toLon - fromLon;
            double len = Math.hypot(dLat, dLon);
            if (len > 1e-6) {
                double pLat = -dLon / len, pLon = dLat / len;          // perpendicular unitario
                double base = Math.min(0.7, Math.max(0.15, len * 0.22)); // desvío proporcional
                double[] offs = { base, -base, base * 1.7, -base * 1.7 };
                for (double off : offs) {
                    if (out.size() >= 3) break;
                    double vLat = mLat + pLat * off, vLon = mLon + pLon * off;
                    JsonNode r2 = osrm(fromLon + "," + fromLat + ";" + vLon + "," + vLat + ";" + toLon + "," + toLat, false);
                    if (r2 == null) continue;
                    Map<String, Object> m = parseRoute(r2.path("routes").path(0));
                    if (m == null) continue;
                    double dist = (double) m.get("distanceKm");
                    double minKm = Double.MAX_VALUE; boolean dup = false;
                    for (Map<String, Object> e : out) {
                        double ed = (double) e.get("distanceKm");
                        minKm = Math.min(minKm, ed);
                        if (Math.abs(ed - dist) / Math.max(ed, 1) < 0.03) dup = true;   // casi igual → descartar
                    }
                    if (!dup && dist < minKm * 1.8) out.add(m);   // evita desvíos absurdos
                }
            }
        }
        return out;
    }

    /** Llama a OSRM y devuelve el JSON raíz (o null). */
    private JsonNode osrm(String coordsPath, boolean alternatives) {
        String url = "https://router.project-osrm.org/route/v1/driving/" + coordsPath
                + "?overview=full&geometries=geojson&steps=true" + (alternatives ? "&alternatives=3" : "");
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                    .header("User-Agent", UA).header("accept", "application/json")
                    .timeout(Duration.ofSeconds(20)).GET().build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() / 100 != 2) { log.warn("OSRM {}", res.statusCode()); return null; }
            return Json.MAPPER.readTree(res.body());
        } catch (Exception e) { log.warn("OSRM falló: {}", e.getMessage()); return null; }
    }

    /** Convierte un objeto route de OSRM a nuestro mapa (o null si no hay geometría). */
    private Map<String, Object> parseRoute(JsonNode r) {
        if (r == null || r.isMissingNode()) return null;
        List<double[]> coords = new ArrayList<>();
        for (JsonNode c : r.path("geometry").path("coordinates"))
            coords.add(new double[]{ c.path(1).asDouble(), c.path(0).asDouble() }); // [lat, lon]
        if (coords.isEmpty()) return null;
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("distanceKm", Math.round(r.path("distance").asDouble() / 100.0) / 10.0);
        m.put("durationMin", Math.round(r.path("duration").asDouble() / 60.0));
        m.put("coordinates", coords);
        m.put("via", viaSummary(r));
        return m;
    }

    /** Resume "por dónde pasa" la ruta a partir de las vías más significativas. */
    private static String viaSummary(JsonNode r) {
        java.util.LinkedHashSet<String> roads = new java.util.LinkedHashSet<>();
        for (JsonNode leg : r.path("legs")) {
            String s = leg.path("summary").asText("");
            if (!s.isBlank()) for (String road : s.split(",")) {
                String t = road.trim();
                if (!t.isEmpty()) roads.add(t);
            }
        }
        // Si no hay summary, intenta con los nombres de vía de los steps.
        if (roads.isEmpty()) {
            for (JsonNode leg : r.path("legs"))
                for (JsonNode st : leg.path("steps")) {
                    String nm = st.path("name").asText("");
                    if (!nm.isBlank()) roads.add(nm.trim());
                    if (roads.size() >= 3) break;
                }
        }
        java.util.List<String> top = new java.util.ArrayList<>(roads);
        return String.join(" · ", top.subList(0, Math.min(3, top.size())));
    }
}
