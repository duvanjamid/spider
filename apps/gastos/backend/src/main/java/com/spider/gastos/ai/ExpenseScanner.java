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
import java.util.Map;

/**
 * Lee una captura/recibo con IA (Anthropic vision) y extrae el gasto.
 * Devuelve los campos para que el usuario los confirme antes de guardar.
 */
public class ExpenseScanner {

    private static final Logger log = LoggerFactory.getLogger(ExpenseScanner.class);
    private static final String ENDPOINT = "https://api.anthropic.com/v1/messages";
    private static final String PROMPT = """
            Eres un extractor de gastos. Mira la imagen (recibo, factura o captura de una
            transacción) y devuelve SOLO un objeto JSON, sin texto adicional ni markdown, con:
              amount (número, sin separador de miles),
              currency (código ISO, p.ej. COP, USD; si no se ve, "COP"),
              merchant (comercio o descripción corta),
              spentOn (fecha YYYY-MM-DD; si no se ve, null),
              categorySlug (uno de: comida, transporte, mercado, servicios, ocio, salud, hogar, otros),
              description (breve).
            Si un campo no se puede determinar, usa null.""";

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10)).build();

    /** Extrae el gasto de una imagen en base64. */
    public Map<String, Object> scan(String base64Image, String mediaType) throws Exception {
        if (!Env.aiEnabled()) {
            throw new IllegalStateException("IA no configurada (falta ANTHROPIC_API_KEY)");
        }
        String body = buildRequest(base64Image, mediaType == null ? "image/jpeg" : mediaType);
        HttpRequest req = HttpRequest.newBuilder(URI.create(ENDPOINT))
                .header("x-api-key", Env.anthropicApiKey())
                .header("anthropic-version", "2023-06-01")
                .header("content-type", "application/json")
                .timeout(Duration.ofSeconds(45))
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
        HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() / 100 != 2) {
            log.warn("Anthropic {} → {}", res.statusCode(), res.body());
            throw new RuntimeException("La IA respondió " + res.statusCode());
        }
        return parseExtraction(res.body());
    }

    private String buildRequest(String base64Image, String mediaType) throws Exception {
        ObjectNode root = Json.MAPPER.createObjectNode();
        root.put("model", Env.anthropicModel());
        root.put("max_tokens", 600);
        ArrayNode messages = root.putArray("messages");
        ObjectNode msg = messages.addObject();
        msg.put("role", "user");
        ArrayNode content = msg.putArray("content");
        ObjectNode img = content.addObject();
        img.put("type", "image");
        ObjectNode src = img.putObject("source");
        src.put("type", "base64");
        src.put("media_type", mediaType);
        src.put("data", base64Image);
        ObjectNode txt = content.addObject();
        txt.put("type", "text");
        txt.put("text", PROMPT);
        return Json.MAPPER.writeValueAsString(root);
    }

    private Map<String, Object> parseExtraction(String responseBody) throws Exception {
        JsonNode root = Json.MAPPER.readTree(responseBody);
        String text = root.path("content").path(0).path("text").asText("");
        String jsonText = extractJson(text);
        JsonNode ex = Json.MAPPER.readTree(jsonText);
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("amount", ex.path("amount").isNumber() ? ex.path("amount").asDouble() : null);
        out.put("currency", asText(ex, "currency", "COP"));
        out.put("merchant", asText(ex, "merchant", ""));
        out.put("spentOn", ex.path("spentOn").isNull() ? null : asText(ex, "spentOn", null));
        out.put("categorySlug", asText(ex, "categorySlug", "otros"));
        out.put("description", asText(ex, "description", ""));
        return out;
    }

    private static String extractJson(String s) {
        int a = s.indexOf('{'), b = s.lastIndexOf('}');
        return (a >= 0 && b > a) ? s.substring(a, b + 1) : "{}";
    }

    private static String asText(JsonNode n, String field, String def) {
        JsonNode v = n.path(field);
        return v.isMissingNode() || v.isNull() ? def : v.asText();
    }
}
