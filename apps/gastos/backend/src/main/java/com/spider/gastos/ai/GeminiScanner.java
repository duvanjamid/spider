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
 * descripción y la categoría (de la lista del usuario) o una sugerida.
 */
public class GeminiScanner {

    private static final Logger log = LoggerFactory.getLogger(GeminiScanner.class);

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10)).build();

    /**
     * @param categories lista de categorías del usuario (cada una con id y name).
     * @return estructura con identificado, nit, establecimiento, montos[], etc.
     */
    public Map<String, Object> scan(String base64Image, String mediaType,
                                    List<Map<String, Object>> categories) throws Exception {
        if (!Env.aiEnabled()) throw new IllegalStateException("IA no configurada (falta GEMINI_API_KEY)");

        String url = "https://generativelanguage.googleapis.com/v1beta/models/"
                + Env.geminiModel() + ":generateContent?key=" + Env.geminiApiKey();
        String body = buildRequest(base64Image, mediaType == null ? "image/jpeg" : mediaType, categories);

        HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                .header("content-type", "application/json")
                .timeout(Duration.ofSeconds(45))
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
        HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() / 100 != 2) {
            log.warn("Gemini {} → {}", res.statusCode(), res.body());
            throw new RuntimeException("La IA respondió " + res.statusCode());
        }
        return parse(res.body());
    }

    private String buildRequest(String base64Image, String mediaType,
                                List<Map<String, Object>> categories) throws Exception {
        StringBuilder cats = new StringBuilder();
        for (Map<String, Object> c : categories) {
            cats.append(c.get("id")).append(": ").append(c.get("name")).append("; ");
        }
        String prompt = """
                Analiza la imagen de una factura, recibo o comprobante de compra y devuelve SOLO un
                objeto JSON (sin markdown) con exactamente esta forma:
                {
                  "identificado": true|false,
                  "nit": string|null,
                  "establecimiento": string|null,
                  "montos": [ { "etiqueta": string, "valor": number } ],
                  "descripcion": string|null,
                  "categoriaId": number|null,
                  "categoriaNombre": string|null,
                  "categoriaSugerida": string|null
                }
                Reglas:
                - "montos": lista TODOS los totales candidatos que veas (p. ej. "Subtotal/Neto",
                  "Total con IVA", "Total con propina/servicio", "Total a pagar"). Valores numéricos
                  sin separador de miles.
                - "categoriaId"/"categoriaNombre": elige de esta lista del usuario (id: nombre): %s
                - Si NINGUNA categoría aplica, deja categoriaId/categoriaNombre en null y propón un
                  nombre en "categoriaSugerida".
                - Si la imagen NO es una factura legible o no hay montos, pon "identificado": false.
                """.formatted(cats.toString().trim());

        ObjectNode root = Json.MAPPER.createObjectNode();
        ArrayNode contents = root.putArray("contents");
        ObjectNode msg = contents.addObject();
        ArrayNode parts = msg.putArray("parts");
        ObjectNode img = parts.addObject();
        ObjectNode inline = img.putObject("inline_data");
        inline.put("mime_type", mediaType);
        inline.put("data", base64Image);
        parts.addObject().put("text", prompt);
        ObjectNode gen = root.putObject("generationConfig");
        gen.put("temperature", 0.1);
        gen.put("responseMimeType", "application/json");
        return Json.MAPPER.writeValueAsString(root);
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

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("identificado", identificado);
        out.put("nit", asText(ex, "nit"));
        out.put("establecimiento", asText(ex, "establecimiento"));
        out.put("montos", montos);
        out.put("descripcion", asText(ex, "descripcion"));
        out.put("categoriaId", ex.path("categoriaId").isNumber() ? ex.path("categoriaId").asLong() : null);
        out.put("categoriaNombre", asText(ex, "categoriaNombre"));
        out.put("categoriaSugerida", asText(ex, "categoriaSugerida"));
        return out;
    }

    private static String extractJson(String s) {
        int a = s.indexOf('{'), b = s.lastIndexOf('}');
        return (a >= 0 && b > a) ? s.substring(a, b + 1) : "{}";
    }

    private static String asText(JsonNode n, String field) {
        JsonNode v = n.path(field);
        return v.isMissingNode() || v.isNull() ? null : v.asText();
    }
}
