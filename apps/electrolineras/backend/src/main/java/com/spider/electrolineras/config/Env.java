package com.spider.electrolineras.config;

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
    public static String appName() { return get("APP_NAME", "electrolineras"); }
    public static String dbSchema() { return get("DB_SCHEMA", appName()); }
    public static String environment() {
        return get("SPIDER_ENV", dbSchema().startsWith("test_") ? "test" : "production");
    }

    // ── Sesión de la plataforma (misma cookie/HMAC que el admin) ──
    public static String authJwtSecret() { return get("AUTH_JWT_SECRET", "dev-secret-change-me"); }

    // ── Fuente de datos abierta: datos.gov.co (Socrata/SODA) ──
    //   Dataset EPM por defecto (estaciones de carga eléctrica). Sin key.
    public static String datosGovResource() { return get("DATOS_GOV_RESOURCE", "qqm3-dw2u"); }
    public static String datosGovBase() { return get("DATOS_GOV_BASE", "https://www.datos.gov.co/resource"); }
    public static String datosGovAppToken() { return get("DATOS_GOV_APP_TOKEN", ""); } // opcional (más cuota)
    // Cada cuánto refrescar el catálogo desde el gobierno (minutos).
    public static int syncMinutes() { return getInt("SYNC_MINUTES", 360); }
    public static boolean syncOnStart() { return Boolean.parseBoolean(get("SYNC_ON_START", "true")); }

    // ── Open Charge Map (cobertura NACIONAL, crowdsourced) ──
    //   Requiere API key gratuita (openchargemap.org). Si falta, se omite.
    public static String openChargeMapKey() { return get("OPENCHARGEMAP_KEY", ""); }
    public static boolean openChargeMapEnabled() { return !openChargeMapKey().isBlank(); }
    public static int openChargeMapMax() { return getInt("OPENCHARGEMAP_MAX", 5000); }
    public static String openChargeMapCountry() { return get("OPENCHARGEMAP_COUNTRY", "CO"); }
}
