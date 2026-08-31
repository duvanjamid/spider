package com.spider.gastos.session;

import com.fasterxml.jackson.databind.JsonNode;
import com.spider.gastos.config.Env;
import com.spider.gastos.util.Json;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

/**
 * Identifica al usuario a partir de la cookie {@code spider_session} que emite
 * el admin (misma plataforma, mismo origen tras el gateway). Verifica el HMAC
 * con {@code AUTH_JWT_SECRET}. Si no hay sesión válida, devuelve un invitado,
 * para poder probar sin login (las categorías/gastos quedan aislados por email).
 *
 * <p>El payload de la cookie es un JSON {@code {"e":email,"n":name,"p":picture,"x":exp}}
 * (perfil de Google); se acepta también el formato antiguo {@code email|exp}.
 */
public final class Identity {

    /** Perfil mínimo del usuario tomado de la cookie de sesión. */
    public record Profile(String email, String name, String picture) {}

    private static final String COOKIE = "spider_session";
    public static final String GUEST = "invitado@spider";

    private final byte[] secret = Env.authJwtSecret().getBytes(StandardCharsets.UTF_8);

    /** Email del usuario actual (o invitado si no hay sesión). */
    public String emailOrGuest(String cookieHeader) {
        String email = emailFromCookie(cookieHeader);
        return email == null ? GUEST : email;
    }

    public String emailFromCookie(String cookieHeader) {
        Profile p = profileFromCookie(cookieHeader);
        return p == null ? null : p.email();
    }

    /** Perfil (email + nombre + foto) del usuario actual, o null si no hay sesión válida. */
    public Profile profileFromCookie(String cookieHeader) {
        if (cookieHeader == null) return null;
        for (String part : cookieHeader.split(";")) {
            String p = part.trim();
            if (p.startsWith(COOKIE + "=")) return verify(p.substring(COOKIE.length() + 1));
        }
        return null;
    }

    private Profile verify(String token) {
        if (token == null || token.isBlank()) return null;
        int dot = token.indexOf('.');
        if (dot < 0) return null;
        String p = token.substring(0, dot);
        String sig = token.substring(dot + 1);
        if (!constantTimeEquals(b64(hmac(p)), sig)) return null;
        String payload = new String(Base64.getUrlDecoder().decode(p), StandardCharsets.UTF_8);
        long now = System.currentTimeMillis() / 1000;

        if (payload.startsWith("{")) {
            try {
                JsonNode n = Json.MAPPER.readTree(payload);
                long exp = n.path("x").asLong(0);
                if (exp <= 0 || now > exp) return null;
                String email = n.path("e").asText(null);
                if (email == null || email.isBlank()) return null;
                return new Profile(email, textOrNull(n, "n"), textOrNull(n, "p"));
            } catch (Exception e) { return null; }
        }

        int bar = payload.lastIndexOf('|');
        if (bar < 0) return null;
        try {
            if (now > Long.parseLong(payload.substring(bar + 1))) return null;
            return new Profile(payload.substring(0, bar), null, null);
        } catch (NumberFormatException e) { return null; }
    }

    private static String textOrNull(JsonNode n, String field) {
        JsonNode v = n.get(field);
        return v == null || v.isNull() || v.asText().isBlank() ? null : v.asText();
    }

    private byte[] hmac(String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            return mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) { throw new IllegalStateException(e); }
    }

    private static String b64(byte[] b) { return Base64.getUrlEncoder().withoutPadding().encodeToString(b); }

    private static boolean constantTimeEquals(String a, String b) {
        if (a.length() != b.length()) return false;
        int r = 0;
        for (int i = 0; i < a.length(); i++) r |= a.charAt(i) ^ b.charAt(i);
        return r == 0;
    }
}
