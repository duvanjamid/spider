package com.spider.admin.auth;

import com.ligero.Ligero;
import com.spider.admin.access.AccessService;
import com.spider.admin.config.Env;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * Login con Google + sesión + identidad del usuario actual.
 *
 * <p>Endpoints:
 * <ul>
 *   <li>{@code GET  /auth/google/login}    → redirige a Google.</li>
 *   <li>{@code GET  /auth/google/callback} → canje de tokens (TODO Google).</li>
 *   <li>{@code POST /auth/dev-login}       → login sin Google (solo si AUTH_DEV_LOGIN).</li>
 *   <li>{@code GET  /auth/me}              → {email, admin} del usuario actual.</li>
 *   <li>{@code POST /auth/logout}          → cierra sesión.</li>
 * </ul>
 *
 * <p>NOTA API de Ligero: lectura de header de request con {@code ctx.header(name)}
 * y escritura de respuesta con {@code ctx.header(name, value)}. Si tu versión usa
 * otros nombres, ajústalos aquí (punto único).
 */
public final class AuthController {

    private static final Logger log = LoggerFactory.getLogger(AuthController.class);

    private static final String GOOGLE_AUTH_ENDPOINT =
            "https://accounts.google.com/o/oauth2/v2/auth";
    private static final String COOKIE_ATTRS = "; Path=/; HttpOnly; SameSite=Lax";

    private final AuthService auth;
    private final AccessService access;

    public AuthController(AuthService auth, AccessService access) {
        this.auth = auth;
        this.access = access;
    }

    public void register(Ligero app) {
        app.get("/auth/google/login", ctx -> {
            String redirectUri = Env.get("PUBLIC_BASE_URL", "http://localhost:8080")
                    + "/admin-api/auth/google/callback";
            String url = GOOGLE_AUTH_ENDPOINT
                    + "?client_id=" + enc(Env.get("GOOGLE_CLIENT_ID", ""))
                    + "&redirect_uri=" + enc(redirectUri)
                    + "&response_type=code"
                    + "&scope=" + enc("openid email profile")
                    + "&access_type=offline&prompt=select_account";
            ctx.redirect(url);
        });

        app.get("/auth/google/callback", ctx -> {
            String base = Env.get("PUBLIC_BASE_URL", "http://localhost:8080");
            String code = ctx.queryParam("code");
            if (code == null || code.isBlank()) {
                // Google devolvió un error (o el usuario canceló) → a la pantalla de login.
                String reason = ctx.queryParam("error");
                ctx.redirect(base + "/admin/?auth_error=" + enc(reason == null ? "Login cancelado" : reason));
                return;
            }
            try {
                var session = auth.completeLogin(code);
                ctx.header("Set-Cookie", auth.cookieName() + "=" + session.token() + COOKIE_ATTRS);
                ctx.redirect(base + "/");
            } catch (Exception e) {
                // No dejamos un 500 mudo: registramos el detalle y mostramos el motivo en el login.
                log.error("Fallo en el login con Google: {}", e.getMessage(), e);
                ctx.redirect(base + "/admin/?auth_error=" + enc(shortReason(e.getMessage())));
            }
        });

        app.get("/auth/me", ctx -> {
            var profile = auth.profileFromCookie(ctx.header("Cookie"));
            if (profile == null) {
                ctx.status(401).json(Map.of("error", "unauthenticated"));
                return;
            }
            ctx.json(meJson(profile));
        });

        app.post("/auth/logout", ctx -> {
            ctx.header("Set-Cookie", auth.cookieName() + "=" + COOKIE_ATTRS + "; Max-Age=0");
            ctx.json(Map.of("status", "logged_out"));
        });
    }

    /** {email, admin, name, picture} del perfil actual (name/picture "" si faltan). */
    private Map<String, Object> meJson(Sessions.Profile profile) {
        Map<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("email", profile.email());
        m.put("admin", access.isAdmin(profile.email()));
        m.put("name", profile.name() == null ? "" : profile.name());
        m.put("picture", profile.picture() == null ? "" : profile.picture());
        return m;
    }

    /** Mensaje corto y legible para mostrar en el login (sin volcar stacktraces). */
    private static String shortReason(String msg) {
        if (msg == null || msg.isBlank()) return "No se pudo completar el login. Intenta de nuevo.";
        String m = msg.replaceAll("\\s+", " ").trim();
        return m.length() > 200 ? m.substring(0, 200) + "…" : m;
    }

    private static String enc(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }
}
