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

    /** Ruta por carretera entre dos puntos. Devuelve distancia, duración y geometría [lat,lon]. */
    public Map<String, Object> route(double fromLat, double fromLon, double toLat, double toLon) {
        String url = "https://router.project-osrm.org/route/v1/driving/"
                + fromLon + "," + fromLat + ";" + toLon + "," + toLat
                + "?overview=full&geometries=geojson";
        Map<String, Object> out = new LinkedHashMap<>();
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                    .header("User-Agent", UA).header("accept", "application/json")
                    .timeout(Duration.ofSeconds(20)).GET().build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() / 100 != 2) { log.warn("OSRM {}", res.statusCode()); return out; }
            JsonNode root = Json.MAPPER.readTree(res.body());
            JsonNode r0 = root.path("routes").path(0);
            if (r0.isMissingNode()) return out;
            List<double[]> coords = new ArrayList<>();
            for (JsonNode c : r0.path("geometry").path("coordinates")) {
                coords.add(new double[]{ c.path(1).asDouble(), c.path(0).asDouble() }); // [lat, lon]
            }
            out.put("distanceKm", Math.round(r0.path("distance").asDouble() / 100.0) / 10.0);
            out.put("durationMin", Math.round(r0.path("duration").asDouble() / 60.0));
            out.put("coordinates", coords);
        } catch (Exception e) { log.warn("Route falló: {}", e.getMessage()); }
        return out;
    }
}
