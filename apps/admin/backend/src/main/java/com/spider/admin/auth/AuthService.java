package com.spider.admin.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.spider.admin.config.Env;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;

/**
 * Autenticación y sesión. No conoce Ligero (separación de capas).
 *
 * <p>La identidad se representa por el correo verificado. La sesión es un token
 * firmado (ver {@link Sessions}). Google alimenta {@link #completeLogin} con el
 * correo del {@code id_token}; el dev-login lo hace directamente (solo en
 * entornos con {@code AUTH_DEV_LOGIN=true}).
 */
public class AuthService {

    /** Sesión emitida tras un login correcto. */
    public record Session(String token, String email) {}

    private static final String COOKIE = "spider_session";
    private static final String TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

    private final Sessions sessions;
    private final ObjectMapper json = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10)).build();

    public AuthService(Sessions sessions) {
        this.sessions = sessions;
    }

    /**
     * Canjea el authorization code de Google por tokens, valida el {@code id_token}
     * y emite la sesión de Spider con el correo verificado.
     *
     * <p>Al ser el flujo de <em>authorization code</em>, el {@code id_token} se
     * recibe directamente del token endpoint de Google sobre TLS (canal de
     * confianza), por lo que —según OIDC §3.1.3.7— la verificación de firma es
     * opcional; aun así validamos {@code aud}, {@code iss}, {@code exp} y que el
     * correo esté verificado (defensa en profundidad).
     */
    public Session completeLogin(String authorizationCode) {
        String clientId = Env.get("GOOGLE_CLIENT_ID", "");
        String clientSecret = Env.get("GOOGLE_CLIENT_SECRET", "");
        if (clientId.isBlank() || clientSecret.isBlank()) {
            throw new IllegalStateException("Falta GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET");
        }
        String redirectUri = Env.get("PUBLIC_BASE_URL", "http://localhost:8080")
                + "/admin-api/auth/google/callback";

        String form = "code=" + enc(authorizationCode)
                + "&client_id=" + enc(clientId)
                + "&client_secret=" + enc(clientSecret)
                + "&redirect_uri=" + enc(redirectUri)
                + "&grant_type=authorization_code";

        String idToken;
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(TOKEN_ENDPOINT))
                    .timeout(Duration.ofSeconds(15))
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .header("Accept", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(form, StandardCharsets.UTF_8))
                    .build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() / 100 != 2) {
                throw new IllegalStateException("Google rechazó el canje de tokens (HTTP "
                        + res.statusCode() + "): " + res.body());
            }
            JsonNode body = json.readTree(res.body());
            idToken = body.path("id_token").asText(null);
            if (idToken == null || idToken.isBlank()) {
                throw new IllegalStateException("La respuesta de Google no trae id_token");
            }
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("Error canjeando el código con Google", e);
        }

        JsonNode claims = decodeJwtPayload(idToken);

        String aud = claims.path("aud").asText("");
        if (!clientId.equals(aud)) {
            throw new IllegalStateException("id_token con audience inesperada");
        }
        String iss = claims.path("iss").asText("");
        if (!"accounts.google.com".equals(iss) && !"https://accounts.google.com".equals(iss)) {
            throw new IllegalStateException("id_token con issuer inesperado");
        }
        long exp = claims.path("exp").asLong(0);
        if (exp <= 0 || System.currentTimeMillis() / 1000 > exp) {
            throw new IllegalStateException("id_token expirado");
        }
        if (claims.has("email_verified") && !claims.path("email_verified").asBoolean(false)) {
            throw new IllegalStateException("El correo de Google no está verificado");
        }
        String email = claims.path("email").asText("").trim().toLowerCase();
        if (email.isBlank()) {
            throw new IllegalStateException("id_token sin correo");
        }
        String name = claims.path("name").asText("").trim();
        String picture = claims.path("picture").asText("").trim();

        return new Session(sessions.issue(email, name, picture), email);
    }

    /** Decodifica (sin verificar firma) el payload de un JWT y lo parsea como JSON. */
    private JsonNode decodeJwtPayload(String jwt) {
        try {
            String[] parts = jwt.split("\\.");
            if (parts.length < 2) throw new IllegalStateException("id_token malformado");
            byte[] payload = Base64.getUrlDecoder().decode(parts[1]);
            return json.readTree(payload);
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("No se pudo leer el id_token", e);
        }
    }

    /** Extrae y verifica el correo de la cookie de sesión; null si no hay/expiró. */
    public String emailFromCookie(String cookieHeader) {
        Sessions.Profile p = profileFromCookie(cookieHeader);
        return p == null ? null : p.email();
    }

    /** Extrae el perfil (email + nombre + foto) de la cookie de sesión; null si no hay/expiró. */
    public Sessions.Profile profileFromCookie(String cookieHeader) {
        if (cookieHeader == null) return null;
        for (String part : cookieHeader.split(";")) {
            String p = part.trim();
            if (p.startsWith(COOKIE + "=")) {
                return sessions.profile(p.substring(COOKIE.length() + 1));
            }
        }
        return null;
    }

    public String cookieName() {
        return COOKIE;
    }

    private static String enc(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }
}
