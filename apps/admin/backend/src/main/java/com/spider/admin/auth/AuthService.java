package com.spider.admin.auth;

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

    private final Sessions sessions;

    public AuthService(Sessions sessions) {
        this.sessions = sessions;
    }

    /** Login de desarrollo: emite sesión para un correo arbitrario. */
    public Session devLogin(String email) {
        return new Session(sessions.issue(email), email);
    }

    /**
     * Canjea el authorization code de Google, valida el id_token y emite sesión.
     * TODO(auth): POST a https://oauth2.googleapis.com/token, verificar el
     * id_token con las JWKS de Google y extraer el email; luego:
     *   return new Session(sessions.issue(email), email);
     */
    public Session completeLogin(String authorizationCode) {
        throw new UnsupportedOperationException(
                "Configura GOOGLE_CLIENT_ID/SECRET e implementa el canje de tokens en completeLogin");
    }

    /** Extrae y verifica el correo de la cookie de sesión; null si no hay/expiró. */
    public String emailFromCookie(String cookieHeader) {
        if (cookieHeader == null) return null;
        for (String part : cookieHeader.split(";")) {
            String p = part.trim();
            if (p.startsWith(COOKIE + "=")) {
                return sessions.verify(p.substring(COOKIE.length() + 1));
            }
        }
        return null;
    }

    public String cookieName() {
        return COOKIE;
    }
}
