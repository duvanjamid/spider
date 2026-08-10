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
    public static String geminiApiKey() { return get("GEMINI_API_KEY", ""); }
    public static String geminiModel() { return get("GEMINI_MODEL", "gemini-flash-latest"); }
    public static boolean aiEnabled() { return !geminiApiKey().isBlank(); }

    // ── Secreto de sesión de la plataforma (mismo que el admin) para
    //    identificar al usuario por la cookie spider_session. ──
    public static String authJwtSecret() { return get("AUTH_JWT_SECRET", "dev-secret-change-me"); }
}
