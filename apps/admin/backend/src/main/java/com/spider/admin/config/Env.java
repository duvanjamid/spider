package com.spider.admin.config;

/**
 * Lectura centralizada de configuración desde variables de entorno.
 *
 * <p>Regla del proyecto: la configuración vive en el entorno (12-factor),
 * no en el código. En local la inyecta docker-compose; en Render, el
 * dashboard / render.yaml. Nunca se commitean secretos.
 */
public final class Env {

    private Env() {}

    public static String get(String key, String fallback) {
        String v = System.getenv(key);
        return (v == null || v.isBlank()) ? fallback : v;
    }

    public static String require(String key) {
        String v = System.getenv(key);
        if (v == null || v.isBlank()) {
            throw new IllegalStateException("Falta la variable de entorno obligatoria: " + key);
        }
        return v;
    }

    public static int getInt(String key, int fallback) {
        String v = System.getenv(key);
        return (v == null || v.isBlank()) ? fallback : Integer.parseInt(v.trim());
    }

    // ── Puerto HTTP. Render inyecta PORT; en local usamos 8080. ──
    public static int port() {
        return getInt("PORT", 8080);
    }

    // ── Nombre lógico de la app (para logs y rutas). ──
    public static String appName() {
        return get("APP_NAME", "admin");
    }

    // ── Schema de esta app en la BD compartida.
    //    prod → "admin"; test → "test_admin". Lo fija el entorno. ──
    public static String dbSchema() {
        return get("DB_SCHEMA", appName());
    }

    // ── Entorno lógico: "test" o "production". Se deriva del prefijo de
    //    schema (test_*) salvo que se fije SPIDER_ENV explícitamente. ──
    public static String environment() {
        return get("SPIDER_ENV", dbSchema().startsWith("test_") ? "test" : "production");
    }

    // ── Secreto para firmar las sesiones (HMAC). ──
    public static String authJwtSecret() {
        return get("AUTH_JWT_SECRET", "dev-secret-change-me");
    }

    // ── Correos con rol de super-admin (separados por coma). ──
    public static java.util.Set<String> adminEmails() {
        String raw = get("ADMIN_EMAILS", "");
        java.util.Set<String> out = new java.util.HashSet<>();
        for (String e : raw.split(",")) {
            String t = e.trim().toLowerCase();
            if (!t.isBlank()) out.add(t);
        }
        return out;
    }

    // ── Login de desarrollo (sin Google). NUNCA activar en producción. ──
    public static boolean devLoginEnabled() {
        return Boolean.parseBoolean(get("AUTH_DEV_LOGIN", "false"));
    }

    // ── Secreto servicio-a-servicio para el auto-registro de apps. ──
    public static String registryToken() {
        return get("REGISTRY_TOKEN", "");
    }
}
