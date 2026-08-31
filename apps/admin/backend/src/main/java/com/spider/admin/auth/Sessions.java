package com.spider.admin.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

/**
 * Sesiones firmadas (HMAC-SHA256), sin dependencias de framework.
 *
 * <p>Formato del token: {@code base64url(payload).base64url(hmac)}. El
 * {@code payload} es un JSON compacto con el correo verificado, el perfil de
 * Google (nombre y foto) y la expiración:
 * {@code {"e":email,"n":name,"p":picture,"x":expEpochSeconds}}.
 *
 * <p>Se acepta también el formato antiguo {@code email|exp} para no invalidar
 * las sesiones ya emitidas (compatibilidad hacia atrás). La identidad la aporta
 * Google (o el dev-login) y aquí solo firmamos esos datos verificados.
 */
public final class Sessions {

    /** Perfil mínimo del usuario, tomado del id_token de Google. */
    public record Profile(String email, String name, String picture) {}

    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder B64D = Base64.getUrlDecoder();
    private static final long TTL_SECONDS = 7 * 24 * 3600; // 7 días

    private final byte[] secret;
    private final ObjectMapper json = new ObjectMapper();

    public Sessions(String secret) {
        this.secret = secret.getBytes(StandardCharsets.UTF_8);
    }

    /** Emite una sesión solo con el correo (p.ej. dev-login, sin perfil). */
    public String issue(String email) {
        return issue(email, null, null);
    }

    /** Emite una sesión con el correo y el perfil de Google (nombre, foto). */
    public String issue(String email, String name, String picture) {
        long exp = System.currentTimeMillis() / 1000 + TTL_SECONDS;
        ObjectNode o = json.createObjectNode();
        o.put("e", email);
        o.put("x", exp);
        if (name != null && !name.isBlank()) o.put("n", name);
        if (picture != null && !picture.isBlank()) o.put("p", picture);
        String p = B64.encodeToString(o.toString().getBytes(StandardCharsets.UTF_8));
        return p + "." + B64.encodeToString(hmac(p));
    }

    /** Devuelve el email si el token es válido y no ha expirado; si no, null. */
    public String verify(String token) {
        Profile pr = profile(token);
        return pr == null ? null : pr.email();
    }

    /** Devuelve el perfil (email + nombre + foto) si el token es válido; si no, null. */
    public Profile profile(String token) {
        if (token == null || token.isBlank()) return null;
        int dot = token.indexOf('.');
        if (dot < 0) return null;
        String p = token.substring(0, dot);
        String sig = token.substring(dot + 1);
        if (!constantTimeEquals(B64.encodeToString(hmac(p)), sig)) return null;
        String payload = new String(B64D.decode(p), StandardCharsets.UTF_8);
        long now = System.currentTimeMillis() / 1000;

        if (payload.startsWith("{")) {
            try {
                JsonNode n = json.readTree(payload);
                long exp = n.path("x").asLong(0);
                if (exp <= 0 || now > exp) return null;
                String email = n.path("e").asText(null);
                if (email == null || email.isBlank()) return null;
                return new Profile(email, textOrNull(n, "n"), textOrNull(n, "p"));
            } catch (Exception e) {
                return null;
            }
        }

        // Formato antiguo: email|exp
        int bar = payload.lastIndexOf('|');
        if (bar < 0) return null;
        try {
            long exp = Long.parseLong(payload.substring(bar + 1));
            if (now > exp) return null;
            return new Profile(payload.substring(0, bar), null, null);
        } catch (NumberFormatException e) {
            return null;
        }
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
