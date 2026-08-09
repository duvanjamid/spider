package com.spider.admin.auth;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

/**
 * Sesiones firmadas (HMAC-SHA256), sin dependencias externas.
 *
 * <p>Formato del token: {@code base64url(payload).base64url(hmac)} donde
 * {@code payload = email + "|" + expiraciónEpochSeconds}. Es suficiente para
 * el MVP: la identidad la aporta Google (o el dev-login) y aquí solo firmamos
 * el correo verificado. Si más adelante se quiere un JWT estándar, se cambia
 * solo esta clase.
 */
public final class Sessions {

    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder B64D = Base64.getUrlDecoder();
    private static final long TTL_SECONDS = 7 * 24 * 3600; // 7 días

    private final byte[] secret;

    public Sessions(String secret) {
        this.secret = secret.getBytes(StandardCharsets.UTF_8);
    }

    public String issue(String email) {
        long exp = System.currentTimeMillis() / 1000 + TTL_SECONDS;
        String payload = email + "|" + exp;
        String p = B64.encodeToString(payload.getBytes(StandardCharsets.UTF_8));
        return p + "." + B64.encodeToString(hmac(p));
    }

    /** Devuelve el email si el token es válido y no ha expirado; si no, null. */
    public String verify(String token) {
        if (token == null || token.isBlank()) return null;
        int dot = token.indexOf('.');
        if (dot < 0) return null;
        String p = token.substring(0, dot);
        String sig = token.substring(dot + 1);
        if (!constantTimeEquals(B64.encodeToString(hmac(p)), sig)) return null;
        String payload = new String(B64D.decode(p), StandardCharsets.UTF_8);
        int bar = payload.lastIndexOf('|');
        if (bar < 0) return null;
        try {
            long exp = Long.parseLong(payload.substring(bar + 1));
            if (System.currentTimeMillis() / 1000 > exp) return null;
            return payload.substring(0, bar);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private byte[] hmac(String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            return mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException("No se pudo firmar la sesión", e);
        }
    }

    private static boolean constantTimeEquals(String a, String b) {
        if (a.length() != b.length()) return false;
        int r = 0;
        for (int i = 0; i < a.length(); i++) r |= a.charAt(i) ^ b.charAt(i);
        return r == 0;
    }
}
