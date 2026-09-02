package com.spider.gastos.config;

/** Configuración por variables de entorno (12-factor). */
public final class Env {
    private Env() {}
    public static String get(String k, String d) {
        String v = System.getenv(k); return (v == null || v.isBlank()) ? d : v;
    }
    public static String require(String k) {
        String v = System.getenv(k);
        if (v == null || v.isBlank()) throw new IllegalStateException("Falta env: " + k);
        return v;
    }
    public static int getInt(String k, int d) {
        String v = System.getenv(k); return (v == null || v.isBlank()) ? d : Integer.parseInt(v.trim());
    }
    public static int port() { return getInt("PORT", 8080); }
    public static String appName() { return get("APP_NAME", "gastos"); }
    public static String dbSchema() { return get("DB_SCHEMA", appName()); }

    // ── Entorno lógico ("test" | "production"), derivado del prefijo de schema. ──
    public static String environment() {
        return get("SPIDER_ENV", dbSchema().startsWith("test_") ? "test" : "production");
    }

    // ── IA (Gemini · Google AI Studio) para leer gastos desde una captura. ──
    // trim(): un espacio o salto de línea al pegar la key/modelo en el panel
    // rompe la URL/auth de Gemini (p.ej. modelo con "\n" → 404 model not found).
    public static String geminiApiKey() { return get("GEMINI_API_KEY", "").trim(); }
    public static String geminiModel() { return get("GEMINI_MODEL", "gemini-flash-latest").trim(); }
    public static boolean aiEnabled() { return !geminiApiKey().isBlank(); }

    // Presupuesto de "pensamiento" de Gemini (tokens). Con 0 el modelo no razona
    // y falla al leer la imagen del recibo; con un presupuesto acotado dispone de
    // unos segundos para pensar sin dispararse a 20-40s. Configurable por entorno.
    public static int geminiThinkingBudget() { return getInt("GEMINI_THINKING_BUDGET", 2048); }

    // Timeout de la llamada a Gemini (segundos). Ha de dar margen a esos segundos
    // de pensamiento para no cortar la respuesta a mitad.
    public static int geminiTimeoutSeconds() { return getInt("GEMINI_TIMEOUT_SECONDS", 90); }

    // ── Secreto de sesión de la plataforma (mismo que el admin) para
    //    identificar al usuario por la cookie spider_session. ──
    public static String authJwtSecret() { return get("AUTH_JWT_SECRET", "dev-secret-change-me"); }

    // ── Web Push (VAPID). Las claves NO viven en el repo: se inyectan por
    //    entorno. Sin ellas, las notificaciones push quedan deshabilitadas
    //    (la app sigue funcionando; solo no envía push). ──
    public static String vapidPublic() { return get("VAPID_PUBLIC", "").trim(); }
    public static String vapidPrivate() { return get("VAPID_PRIVATE", "").trim(); }
    public static String vapidSubject() { return get("VAPID_SUBJECT", "mailto:admin@spider.muvatec.com").trim(); }
}
