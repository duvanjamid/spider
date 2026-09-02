package com.spider.electrolineras.session;

import com.spider.electrolineras.config.Env;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

/**
 * Identifica al usuario por la cookie {@code spider_session} del admin (misma
 * plataforma, mismo origen tras el gateway). Verifica el HMAC con
 * {@code AUTH_JWT_SECRET}. Sin sesión válida devuelve un invitado, para poder
 * probar sin login (los reportes/comentarios quedan aislados por email).
 */
public final class Identity {

    private static final String COOKIE = "spider_session";
    public static final String GUEST = "invitado@spider";

    private final byte[] secret = Env.authJwtSecret().getBytes(StandardCharsets.UTF_8);

    public String emailOrGuest(String cookieHeader) {
        String email = emailFromCookie(cookieHeader);
        return email == null ? GUEST : email;
    }

    public String emailFromCookie(String cookieHeader) {
        if (cookieHeader == null) return null;
        for (String part : cookieHeader.split(";")) {
            String p = part.trim();
            if (p.startsWith(COOKIE + "=")) return verify(p.substring(COOKIE.length() + 1));
        }
        return null;
    }

    private String verify(String token) {
        if (token == null || token.isBlank()) return null;
        int dot = token.indexOf('.');
        if (dot < 0) return null;
        String p = token.substring(0, dot);
        String sig = token.substring(dot + 1);
        if (!constantTimeEquals(b64(hmac(p)), sig)) return null;
        String payload = new String(Base64.getUrlDecoder().decode(p), StandardCharsets.UTF_8);
        int bar = payload.lastIndexOf('|');
        if (bar < 0) return null;
        try {
            if (System.currentTimeMillis() / 1000 > Long.parseLong(payload.substring(bar + 1))) return null;
            return payload.substring(0, bar);
        } catch (NumberFormatException e) { return null; }
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
