package com.spider.admin.access;

import com.ligero.Ligero;
import com.spider.admin.auth.AuthService;

import java.util.Map;

/**
 * Endpoints de acceso a apps.
 *
 * <ul>
 *   <li>{@code GET  /me/apps}       → apps habilitadas para el usuario actual.</li>
 *   <li>{@code GET  /admin/apps}    → todas las apps (solo admin).</li>
 *   <li>{@code GET  /admin/grants}  → todas las concesiones (solo admin).</li>
 *   <li>{@code POST /admin/grant}   → concede acceso {email, app, role} (solo admin).</li>
 *   <li>{@code POST /admin/revoke}  → revoca acceso {email, app} (solo admin).</li>
 * </ul>
 */
public final class AccessController {

    private final AuthService auth;
    private final AccessService access;

    public AccessController(AuthService auth, AccessService access) {
        this.auth = auth;
        this.access = access;
    }

    public void register(Ligero app) {
        app.get("/me/apps", ctx -> {
            String email = auth.emailFromCookie(ctx.header("Cookie"));
            if (email == null) {
                ctx.status(401).json(Map.of("error", "unauthenticated"));
                return;
            }
            ctx.json(access.appsForEmail(email));
        });

        app.get("/admin/apps", ctx -> {
            String email = adminOrNull(ctx.header("Cookie"));
            if (email == null) { ctx.status(403).json(FORBIDDEN); return; }
            ctx.json(access.listAllApps());
        });

        app.get("/admin/grants", ctx -> {
            String email = adminOrNull(ctx.header("Cookie"));
            if (email == null) { ctx.status(403).json(FORBIDDEN); return; }
            ctx.json(access.listGrants());
        });

        // ── Gestión de apps (todas, incl. inactivas) ──
        app.get("/admin/apps-all", ctx -> {
            if (adminOrNull(ctx.header("Cookie")) == null) { ctx.status(403).json(FORBIDDEN); return; }
            ctx.json(access.listAppsAdmin());
        });

        app.post("/admin/apps/active", ctx -> {
            if (adminOrNull(ctx.header("Cookie")) == null) { ctx.status(403).json(FORBIDDEN); return; }
            String slug = ctx.queryParam("slug");
            String active = ctx.queryParam("active");
            if (blank(slug) || blank(active)) { ctx.status(400).json(Map.of("error", "slug y active requeridos")); return; }
            access.setAppActive(slug, Boolean.parseBoolean(active));
            ctx.json(Map.of("status", "ok", "slug", slug, "active", Boolean.parseBoolean(active)));
        });

        // ── Usuarios ──
        app.get("/admin/users", ctx -> {
            if (adminOrNull(ctx.header("Cookie")) == null) { ctx.status(403).json(FORBIDDEN); return; }
            ctx.json(access.listUsers());
        });

        app.get("/admin/users/apps", ctx -> {
            if (adminOrNull(ctx.header("Cookie")) == null) { ctx.status(403).json(FORBIDDEN); return; }
            String target = ctx.queryParam("email");
            if (blank(target)) { ctx.status(400).json(Map.of("error", "email requerido")); return; }
            ctx.json(access.appsForUser(target));
        });

        app.get("/admin/apps/users", ctx -> {
            if (adminOrNull(ctx.header("Cookie")) == null) { ctx.status(403).json(FORBIDDEN); return; }
            String slug = ctx.queryParam("slug");
            if (blank(slug)) { ctx.status(400).json(Map.of("error", "slug requerido")); return; }
            ctx.json(access.usersForApp(slug));
        });

        app.post("/admin/users/revoke-all", ctx -> {
            if (adminOrNull(ctx.header("Cookie")) == null) { ctx.status(403).json(FORBIDDEN); return; }
            String target = ctx.queryParam("email");
            if (blank(target)) { ctx.status(400).json(Map.of("error", "email requerido")); return; }
            access.revokeAll(target);
            ctx.json(Map.of("status", "removed", "email", target));
        });

        app.post("/admin/grant", ctx -> {
            String email = adminOrNull(ctx.header("Cookie"));
            if (email == null) { ctx.status(403).json(FORBIDDEN); return; }
            String target = ctx.queryParam("email");
            String appSlug = ctx.queryParam("app");
            String role = ctx.queryParam("role");
            if (blank(target) || blank(appSlug)) {
                ctx.status(400).json(Map.of("error", "email y app son obligatorios"));
                return;
            }
            access.grant(target, appSlug, role);
            ctx.json(Map.of("status", "granted", "email", target, "app", appSlug));
        });

        app.post("/admin/revoke", ctx -> {
            String email = adminOrNull(ctx.header("Cookie"));
            if (email == null) { ctx.status(403).json(FORBIDDEN); return; }
            String target = ctx.queryParam("email");
            String appSlug = ctx.queryParam("app");
            if (blank(target) || blank(appSlug)) {
                ctx.status(400).json(Map.of("error", "email y app son obligatorios"));
                return;
            }
            access.revoke(target, appSlug);
            ctx.json(Map.of("status", "revoked", "email", target, "app", appSlug));
        });
    }

    private static final Map<String, Object> FORBIDDEN = Map.of("error", "forbidden");

    /** Email del usuario actual si es admin; null en caso contrario. */
    private String adminOrNull(String cookieHeader) {
        String email = auth.emailFromCookie(cookieHeader);
        return (email != null && access.isAdmin(email)) ? email : null;
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }
}
