package com.spider.gastos.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.spider.gastos.config.Env;
import com.spider.gastos.util.Json;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Lee una factura/recibo con Gemini (Google AI Studio) y extrae:
 * NIT, establecimiento, posibles totales (neto, con IVA, con propina…),
 * descripción, fecha, la categoría (de la lista del usuario) o una sugerida,
 * y —cuando es una imagen— las REGIONES de dónde salió cada dato para
 * resaltarlas sobre la foto.
 */
public class GeminiScanner {

    private static final Logger log = LoggerFactory.getLogger(GeminiScanner.class);

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10)).build();

    /** Escaneo de imagen (foto de recibo). Incluye regiones analizadas. */
    public Map<String, Object> scan(String base64Image, String mediaType,
                                    List<Map<String, Object>> categories) throws Exception {
        if (!Env.aiEnabled()) throw new IllegalStateException("IA no configurada (falta GEMINI_API_KEY)");
        ObjectNode root = Json.MAPPER.createObjectNode();
        ArrayNode parts = root.putArray("contents").addObject().putArray("parts");
        ObjectNode inline = parts.addObject().putObject("inline_data");
        inline.put("mime_type", mediaType == null ? "image/jpeg" : mediaType);
        inline.put("data", base64Image);
        parts.addObject().put("text", prompt(categories, true));
        return call(root);
    }

    /** Escaneo desde texto pegado (SMS, correo, nota…). Sin regiones. */
    public Map<String, Object> scanText(String text, List<Map<String, Object>> categories) throws Exception {
        if (!Env.aiEnabled()) throw new IllegalStateException("IA no configurada (falta GEMINI_API_KEY)");
        ObjectNode root = Json.MAPPER.createObjectNode();
        ArrayNode parts = root.putArray("contents").addObject().putArray("parts");
        parts.addObject().put("text", prompt(categories, false)
                + "\n\nTEXTO DEL COMPROBANTE:\n\"\"\"\n" + text + "\n\"\"\"");
        return call(root);
    }

    private Map<String, Object> call(ObjectNode root) throws Exception {
        ObjectNode gen = root.putObject("generationConfig");
        gen.put("temperature", 0.1);
        gen.put("responseMimeType", "application/json");

        String url = "https://generativelanguage.googleapis.com/v1beta/models/"
                + Env.geminiModel() + ":generateContent?key=" + Env.geminiApiKey();
        HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                .header("content-type", "application/json")
                .timeout(Duration.ofSeconds(45))
                .POST(HttpRequest.BodyPublishers.ofString(Json.MAPPER.writeValueAsString(root)))
                .build();
        HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() / 100 != 2) {
            log.warn("Gemini {} → {}", res.statusCode(), res.body());
            throw new RuntimeException("La IA respondió " + res.statusCode());
        }
        return parse(res.body());
    }

    private String prompt(List<Map<String, Object>> categories, boolean withImage) {
        StringBuilder cats = new StringBuilder();
        for (Map<String, Object> c : categories) {
            cats.append(c.get("id")).append(": ").append(c.get("name")).append("; ");
        }
        String regionsSpec = withImage
                ? """
                  ,
                  "regiones": [ { "campo": "nit|establecimiento|monto|descripcion|fecha",
                                  "etiqueta": string, "box": [ymin, xmin, ymax, xmax] } ]
                  """
                : "";
        String regionsRule = withImage
                ? """
                  - "regiones": por cada dato que hayas extraído, indica la región de la imagen de
                    donde lo tomaste. "box" son 4 enteros 0-1000 = [ymin, xmin, ymax, xmax] normalizados
                    al tamaño de la imagen. Incluye al menos el establecimiento y cada monto candidato.
                  """
                : "";
        return """
                Analiza el comprobante de compra (factura/recibo) y devuelve SOLO un objeto JSON
                (sin markdown) con exactamente esta forma:
                {
                  "identificado": true|false,
                  "nit": string|null,
                  "establecimiento": string|null,
                  "montos": [ { "etiqueta": string, "valor": number } ],
                  "descripcion": string|null,
                  "fecha": string|null,
                  "categoriaId": number|null,
                  "categoriaNombre": string|null,
                  "categoriaSugerida": string|null%s
                }
                Reglas:
                - "montos": lista TODOS los totales candidatos que veas (p. ej. "Subtotal/Neto",
                  "Total con IVA", "Total con propina/servicio", "Total a pagar"). Valores numéricos
                  sin separador de miles.
                - "fecha": fecha de la compra en formato YYYY-MM-DD si aparece, si no null.
                - "categoriaId"/"categoriaNombre": elige de esta lista del usuario (id: nombre): %s
                - Si NINGUNA categoría aplica, deja categoriaId/categoriaNombre en null y propón un
                  nombre en "categoriaSugerida".
                - Si NO es un comprobante legible o no hay montos, pon "identificado": false.
                %s""".formatted(regionsSpec, cats.toString().trim(), regionsRule);
    }

    private Map<String, Object> parse(String responseBody) throws Exception {
        JsonNode root = Json.MAPPER.readTree(responseBody);
        String text = root.path("candidates").path(0).path("content").path("parts").path(0)
                .path("text").asText("");
        JsonNode ex = Json.MAPPER.readTree(extractJson(text));

        List<Map<String, Object>> montos = new ArrayList<>();
        for (JsonNode m : ex.path("montos")) {
            if (m.path("valor").isNumber()) {
                montos.add(Map.of(
                        "etiqueta", m.path("etiqueta").asText("Total"),
                        "valor", m.path("valor").asDouble()));
            }
        }
        boolean identificado = ex.path("identificado").asBoolean(false) && !montos.isEmpty();

        List<Map<String, Object>> regiones = new ArrayList<>();
        for (JsonNode r : ex.path("regiones")) {
            JsonNode box = r.path("box");
            if (box.isArray() && box.size() == 4) {
                List<Integer> b = new ArrayList<>(4);
                for (JsonNode n : box) b.add(clamp(n.asInt(0)));
                regiones.add(Map.of(
                        "campo", r.path("campo").asText(""),
                        "etiqueta", r.path("etiqueta").asText(""),
                        "box", b));
            }
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("identificado", identificado);
        out.put("nit", asText(ex, "nit"));
        out.put("establecimiento", asText(ex, "establecimiento"));
        out.put("montos", montos);
        out.put("descripcion", asText(ex, "descripcion"));
        out.put("fecha", asText(ex, "fecha"));
        out.put("categoriaId", ex.path("categoriaId").isNumber() ? ex.path("categoriaId").asLong() : null);
        out.put("categoriaNombre", asText(ex, "categoriaNombre"));
        out.put("categoriaSugerida", asText(ex, "categoriaSugerida"));
        out.put("regiones", regiones);
        return out;
    }

    private static int clamp(int v) { return v < 0 ? 0 : (v > 1000 ? 1000 : v); }

    private static String extractJson(String s) {
        int a = s.indexOf('{'), b = s.lastIndexOf('}');
        return (a >= 0 && b > a) ? s.substring(a, b + 1) : "{}";
    }

    private static String asText(JsonNode n, String field) {
        JsonNode v = n.path(field);
        return v.isMissingNode() || v.isNull() ? null : v.asText();
    }
}
