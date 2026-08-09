package com.spider.admin.auth;

import com.ligero.Ligero;
import com.spider.admin.access.AccessService;
import com.spider.admin.config.Env;

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
            String code = ctx.queryParam("code");
            if (code == null || code.isBlank()) {
                ctx.status(400).json(Map.of("error", "missing_code"));
                return;
            }
            var session = auth.completeLogin(code);
            ctx.header("Set-Cookie", auth.cookieName() + "=" + session.token() + COOKIE_ATTRS);
            ctx.redirect(Env.get("PUBLIC_BASE_URL", "http://localhost:8080") + "/");
        });

        // Login de desarrollo (sin Google). Desactivado por defecto.
        app.post("/auth/dev-login", ctx -> {
            if (!Env.devLoginEnabled()) {
                ctx.status(404).json(Map.of("error", "not_found"));
                return;
            }
            String email = ctx.queryParam("email");
            if (email == null || email.isBlank()) {
                ctx.status(400).json(Map.of("error", "missing_email"));
                return;
            }
            var session = auth.devLogin(email.trim().toLowerCase());
            ctx.header("Set-Cookie", auth.cookieName() + "=" + session.token() + COOKIE_ATTRS);
            ctx.json(Map.of("email", session.email(), "admin", access.isAdmin(session.email())));
        });

        app.get("/auth/me", ctx -> {
            String email = auth.emailFromCookie(ctx.header("Cookie"));
            if (email == null) {
                ctx.status(401).json(Map.of("error", "unauthenticated"));
                return;
            }
            ctx.json(Map.of("email", email, "admin", access.isAdmin(email)));
        });

        app.post("/auth/logout", ctx -> {
            ctx.header("Set-Cookie", auth.cookieName() + "=" + COOKIE_ATTRS + "; Max-Age=0");
            ctx.json(Map.of("status", "logged_out"));
        });
    }

    private static String enc(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }
}
