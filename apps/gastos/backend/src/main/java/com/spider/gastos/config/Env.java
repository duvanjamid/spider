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

    // ── IA (Anthropic) para leer gastos desde una captura. ──
    public static String anthropicApiKey() { return get("ANTHROPIC_API_KEY", ""); }
    public static String anthropicModel() { return get("ANTHROPIC_MODEL", "claude-sonnet-4-5"); }
    public static boolean aiEnabled() { return !anthropicApiKey().isBlank(); }
}
