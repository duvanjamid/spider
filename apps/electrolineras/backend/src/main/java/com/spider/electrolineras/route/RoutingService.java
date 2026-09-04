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
        String url = "https://router.project-osrm.org/route/v1/driving/"
                + fromLon + "," + fromLat + ";" + toLon + "," + toLat
                + "?overview=full&geometries=geojson&alternatives=3&steps=true";
        List<Map<String, Object>> out = new ArrayList<>();
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                    .header("User-Agent", UA).header("accept", "application/json")
                    .timeout(Duration.ofSeconds(20)).GET().build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() / 100 != 2) { log.warn("OSRM {}", res.statusCode()); return out; }
            JsonNode root = Json.MAPPER.readTree(res.body());
            for (JsonNode r : root.path("routes")) {
                List<double[]> coords = new ArrayList<>();
                for (JsonNode c : r.path("geometry").path("coordinates")) {
                    coords.add(new double[]{ c.path(1).asDouble(), c.path(0).asDouble() }); // [lat, lon]
                }
                if (coords.isEmpty()) continue;
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("distanceKm", Math.round(r.path("distance").asDouble() / 100.0) / 10.0);
                m.put("durationMin", Math.round(r.path("duration").asDouble() / 60.0));
                m.put("coordinates", coords);
                m.put("via", viaSummary(r));   // vías principales por las que pasa
                out.add(m);
            }
        } catch (Exception e) { log.warn("Routes falló: {}", e.getMessage()); }
        return out;
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
