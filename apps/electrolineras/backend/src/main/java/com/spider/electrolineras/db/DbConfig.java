package com.spider.electrolineras.db;

import com.spider.electrolineras.config.Env;

/** Resuelve la conexión JDBC desde DATABASE_URL o variables sueltas. */
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
        String url = "jdbc:postgresql://%s:%d/%s".formatted(host, port, name);
        return new DbConfig(url, Env.require("DB_USER"), Env.require("DB_PASSWORD"), schema);
    }

    static DbConfig fromDatabaseUrl(String raw, String schema) {
        if (raw.startsWith("jdbc:")) {
            return new DbConfig(raw, Env.get("DB_USER", ""), Env.get("DB_PASSWORD", ""), schema);
        }
        java.net.URI uri = java.net.URI.create(raw.replaceFirst("^postgresql://", "postgres://"));
        String[] creds = (uri.getUserInfo() == null ? "" : uri.getUserInfo()).split(":", 2);
        String user = creds.length > 0 ? dec(creds[0]) : "";
        String pass = creds.length > 1 ? dec(creds[1]) : "";
        int port = uri.getPort() == -1 ? 5432 : uri.getPort();
        String dbn = uri.getPath() == null ? "" : uri.getPath().replaceFirst("^/", "");
        String query = uri.getQuery() == null ? "sslmode=require" : uri.getQuery();
        String jdbc = "jdbc:postgresql://%s:%d/%s?%s".formatted(uri.getHost(), port, dbn, query);
        return new DbConfig(jdbc, user, pass, schema);
    }

    private static String dec(String s) {
        return java.net.URLDecoder.decode(s, java.nio.charset.StandardCharsets.UTF_8);
    }
}
