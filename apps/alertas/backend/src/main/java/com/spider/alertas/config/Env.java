package com.spider.alertas.config;

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
    public static String appName() { return get("APP_NAME", "alertas"); }
    public static String dbSchema() { return get("DB_SCHEMA", appName()); }
    public static String environment() {
        return get("SPIDER_ENV", dbSchema().startsWith("test_") ? "test" : "production");
    }
    // Secreto de sesión de la plataforma (mismo que el admin) para la cookie.
    public static String authJwtSecret() { return get("AUTH_JWT_SECRET", "dev-secret-change-me"); }
}
