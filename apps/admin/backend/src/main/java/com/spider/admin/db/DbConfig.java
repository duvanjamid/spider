package com.spider.admin.db;

import com.spider.admin.config.Env;

/**
 * Resuelve la conexión JDBC a Postgres a partir del entorno.
 *
 * <p>Soporta dos formas de configuración, en este orden:
 * <ol>
 *   <li>{@code DATABASE_URL} en formato {@code postgres://user:pass@host:port/db}
 *       (lo que entrega Render). Se normaliza a JDBC.</li>
 *   <li>Variables sueltas {@code DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD}
 *       (cómodo en docker-compose local).</li>
 * </ol>
 *
 * <p>Base de datos ÚNICA para todos los entornos y apps; el aislamiento
 * se logra por <b>schema</b> (ver {@link Env#dbSchema()}), no por base.
 */
public record DbConfig(String jdbcUrl, String user, String password, String schema) {

    public static DbConfig fromEnv() {
        String schema = Env.dbSchema();
        String databaseUrl = System.getenv("DATABASE_URL");

        if (databaseUrl != null && !databaseUrl.isBlank()) {
            return fromDatabaseUrl(databaseUrl.trim(), schema);
        }

        String host = Env.get("DB_HOST", "localhost");
        int port = Env.getInt("DB_PORT", 5432);
        String name = Env.get("DB_NAME", "spider");
        String user = Env.require("DB_USER");
        String pass = Env.require("DB_PASSWORD");
        String url = "jdbc:postgresql://%s:%d/%s".formatted(host, port, name);
        return new DbConfig(url, user, pass, schema);
    }

    /** Convierte una URL {@code postgres[ql]://user:pass@host[:port]/db} a JDBC. */
    static DbConfig fromDatabaseUrl(String raw, String schema) {
        // Ya viene en formato JDBC (poco común, pero lo respetamos).
        if (raw.startsWith("jdbc:")) {
            return new DbConfig(raw, Env.get("DB_USER", ""), Env.get("DB_PASSWORD", ""), schema);
        }
        java.net.URI uri = java.net.URI.create(
                raw.replaceFirst("^postgresql://", "postgres://"));
        String userInfo = uri.getUserInfo() == null ? "" : uri.getUserInfo();
        String[] creds = userInfo.split(":", 2);
        String user = creds.length > 0 ? decode(creds[0]) : "";
        String pass = creds.length > 1 ? decode(creds[1]) : "";
        int port = uri.getPort() == -1 ? 5432 : uri.getPort();
        String db = uri.getPath() == null ? "" : uri.getPath().replaceFirst("^/", "");
        // sslmode=require es lo típico contra Postgres gestionado de Render.
        String query = uri.getQuery() == null ? "sslmode=require" : uri.getQuery();
        String jdbc = "jdbc:postgresql://%s:%d/%s?%s".formatted(uri.getHost(), port, db, query);
        return new DbConfig(jdbc, user, pass, schema);
    }

    private static String decode(String s) {
        return java.net.URLDecoder.decode(s, java.nio.charset.StandardCharsets.UTF_8);
    }
}
