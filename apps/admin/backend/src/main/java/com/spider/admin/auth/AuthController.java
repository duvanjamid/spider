package com.spider.admin.auth;

import com.ligero.Ligero;
import com.spider.admin.config.Env;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * Login con Google (OAuth 2.0 / OpenID Connect).
 *
 * <p>Flujo (Authorization Code):
 * <ol>
 *   <li>{@code GET /auth/google/login} → redirige a Google.</li>
 *   <li>Google vuelve a {@code GET /auth/google/callback?code=...}.</li>
 *   <li>Se canjea el {@code code} por tokens, se valida el id_token y se
 *       hace upsert del usuario en la tabla {@code app_user}.</li>
 *   <li>Se emite una sesión (JWT) firmada con {@code AUTH_JWT_SECRET}.</li>
 * </ol>
 *
 * <p>El canje de tokens y la validación del id_token se implementan en
 * {@link AuthService} (marcado con TODO). El control de acceso por app se
 * apoya en {@code user_app_access}: la identidad la da Google; el permiso,
 * la BD del admin.
 */
public final class AuthController {

    private static final String GOOGLE_AUTH_ENDPOINT =
            "https://accounts.google.com/o/oauth2/v2/auth";

    private final AuthService auth;

    public AuthController(AuthService auth) {
        this.auth = auth;
    }

    public void register(Ligero app) {
        app.get("/auth/google/login", ctx -> {
            String redirectUri = Env.get("PUBLIC_BASE_URL", "http://localhost:8080")
                    + "/api/admin/auth/google/callback";
            String url = GOOGLE_AUTH_ENDPOINT
                    + "?client_id=" + enc(Env.get("GOOGLE_CLIENT_ID", ""))
                    + "&redirect_uri=" + enc(redirectUri)
                    + "&response_type=code"
                    + "&scope=" + enc("openid email profile")
                    + "&access_type=offline"
                    + "&prompt=select_account";
            ctx.redirect(url);
        });

        app.get("/auth/google/callback", ctx -> {
            String code = ctx.queryParam("code");
            if (code == null || code.isBlank()) {
                ctx.status(400).json(Map.of("error", "missing_code"));
                return;
            }
            // Canjea code→tokens, valida id_token y upsert de usuario.
            var session = auth.completeLogin(code);
            // Deja la sesión en cookie y vuelve al frontend de la app.
            ctx.header("Set-Cookie",
                    "spider_session=" + session.token()
                            + "; Path=/; HttpOnly; SameSite=Lax");
            ctx.redirect(Env.get("PUBLIC_BASE_URL", "http://localhost:8080") + "/admin/");
        });

        app.get("/auth/me", ctx -> {
            var user = auth.currentUser(ctx.header("Cookie"));
            if (user == null) {
                ctx.status(401).json(Map.of("error", "unauthenticated"));
                return;
            }
            ctx.json(user);
        });

        app.post("/auth/logout", ctx -> {
            ctx.header("Set-Cookie", "spider_session=; Path=/; HttpOnly; Max-Age=0");
            ctx.json(Map.of("status", "logged_out"));
        });
    }

    private static String enc(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }
}
