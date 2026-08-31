package com.spider.gastos.registry;

import com.spider.gastos.config.Env;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

/**
 * Auto-registro de la app en el admin al arrancar (idempotente, no fatal).
 * Mantiene el aislamiento: la app NO toca la BD del admin, solo su API.
 * Requiere ADMIN_REGISTRY_URL y REGISTRY_TOKEN; si faltan, se omite.
 */
public final class Registry {
    private static final Logger log = LoggerFactory.getLogger(Registry.class);
    private Registry() {}

    public static void selfRegister() {
        String adminUrl = Env.get("ADMIN_REGISTRY_URL", "");
        String token = Env.get("REGISTRY_TOKEN", "");
        if (adminUrl.isBlank() || token.isBlank()) {
            log.info("Auto-registro omitido (falta ADMIN_REGISTRY_URL o REGISTRY_TOKEN)");
            return;
        }
        String slug = Env.appName();
        String name = Env.get("APP_TITLE", "Gastos");
        String desc = Env.get("APP_DESCRIPTION", "Registra tus gastos del día a día con IA");
        String icon = Env.get("APP_ICON", "fa-solid fa-wallet");
        String color = Env.get("APP_COLOR", "#10b981");
        String url = adminUrl.replaceAll("/+$", "") + "/registry"
                + "?slug=" + enc(slug) + "&name=" + enc(name) + "&description=" + enc(desc)
                + "&icon=" + enc(icon) + "&color=" + enc(color);
        try {
            HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
            HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                    .header("X-Registry-Token", token)
                    .timeout(Duration.ofSeconds(5))
                    .POST(HttpRequest.BodyPublishers.noBody())
                    .build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() / 100 == 2) log.info("App '{}' registrada en el admin", slug);
            else log.warn("Auto-registro respondió {}: {}", res.statusCode(), res.body());
        } catch (Exception e) {
            log.warn("Auto-registro falló (se continúa): {}", e.getMessage());
        }
    }

    private static String enc(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }
}
